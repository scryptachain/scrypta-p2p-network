require('dotenv').config()
const crypto = require('crypto')
const Swarm = require('discovery-swarm')
const defaults = require('dat-swarm-defaults')
const getPort = require('get-port')
const sign = require('./libs/sign.js')
const encryption = require('./libs/encryption.js')
const utilities = require('./libs/utilities.js')
var argv = require('minimist')(process.argv.slice(2))
const request = require('request')
const express = require('express')
const isPortAvailable = require('is-port-available')

const peers = {}
let relayed = []
let messages = []
let connSeq = 0
let rl
let hook
const app = express()

//SETTING UP SWARM
const NodeID = crypto.randomBytes(32)
console.log('Your Swarm Identity: /swarm/scryptap2p/' + NodeID.toString('hex'))

const sw = Swarm(defaults({
  id: NodeID,
}))


async function initEngine (){

  //SETTING UP EXPRESS
  let expressPort
  if(process.env.EXPRESS_PORT !== undefined){
    expressPort = process.env.EXPRESS_PORT
  }else{
    expressPort = await getPort()
  }
  var available = await isPortAvailable(expressPort)
  while(!available){
    expressPort = await getPort()
    available = await isPortAvailable(expressPort)
  }

  app.get('/', (req, res) => res.send('Scrypta P2P Engine is online with ' + sw.connected + ' connections'))
  app.post('/broadcast', async (req,res) => {
    var parsed = await utilities.parse(req)
    var body = parsed.body
    if(body.message !== undefined){
      if(sw.connected > 0){
        let broadcasted = await broadcastMessage(body.message, peers)
        res.send({success: true, broadcasted: broadcasted})
      }else{
        res.send({error: true, message: 'No connections.'})
      }
    }else{
      res.send({error: true, message: 'Specify message first.'})
    }
  })
  app.listen(expressPort, () => console.log(`Communications API listening on port: ${expressPort}`))
  const port = await getPort()

  sw.listen(port)
  console.log('Swarm listening to port: ' + port)

  sw.join(process.env.SWARM_CHANNEL)

  sw.on('connection', (conn, info) => {
    const seq = connSeq

    const peerId = info.id.toString('hex')

    if (!peers[peerId]) {
      peers[peerId] = {}
      console.log(`Connected to peer: /swarm/scryptap2p/${peerId}`)
    }

    peers[peerId].conn = conn
    peers[peerId].seq = seq
    connSeq++

    if (info.initiator) {
      try {
        conn.setKeepAlive(true, 600)
      } catch (exception) {
        console.log('exception', exception)
      }
    }

    conn.on('data', data => {
      try{
        var received = JSON.parse(data.toString())
        sign.verifySign(received.pubKey, received.signature, received.message).then(async signature => {
          if(signature === true){
            if(messages.indexOf(received.signature) === -1){
              messages.push(received.signature)
              try{
                var decrypted = await encryption.decryptMessage(received.message, 'keys/private.pem')
                console.log("Successfully decrypted a message: " + decrypted)
                received.decrypted = decrypted
                request.post(hook, received, function (error, response, body) {
                  if(error){
                    console.log('Hook failed.')
                  }
                })
              }catch(e){
                console.log('Received a message from ' + received.address + ' with signature ' + received.signature)
                request.post(hook, received, function (error, response, body) {
                  if(error){
                    console.log('Hook failed.')
                  }
                })
              }
            }
            if(relayed.indexOf(received.signature) === -1){
              relayed.push(received.signature)
              console.log('Relay message to other peers.')
              relayMessage(data.toString())
            }

          }
        })
      }catch(e){
        console.log('Received unsigned data, ignoring.')
      }
    })

    conn.on('close', () => {
      if (peers[peerId].seq === seq) {
        delete peers[peerId]
      }
    })

  })
  
  encryption.generateKeys()
  setInterval(function(){
    sw.join(process.env.SWARM_CHANNEL)
  },15000)
}

//HOOK DEFINITION
if(argv.hook !== undefined){
  hook = argv.hook
  console.log('Relay hook is: ' + hook)
}else if(process.env.HOOK !== undefined){
  hook = process.env.HOOK
  console.log('Relay hook is: ' + hook)
}else{
  console.log('WARNING, NO HOOK DETECTED, THE ENGINE WILL NOT RELAY TO DAPP!')
}

async function broadcastMessage(message) {
  return new Promise(response => {
      sign.signWithKey(process.env.NODE_KEY, message).then(signature => {
        console.log('Broadcasting to peers: ' + JSON.stringify(signature))
        messages.push(signature.signature)
        relayed.push(signature.signature)
        signature.message = message
        for (let id in peers) {
            peers[id].conn.write(JSON.stringify(signature))
        }
        response(signature)
      })
  })
}

async function relayMessage(signature) {
  return new Promise(response => {
    for (let id in peers) {
        peers[id].conn.write(signature)
    }
    response(true)
  })
}

initEngine()