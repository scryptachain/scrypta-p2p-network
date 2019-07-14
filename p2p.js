const crypto = require('crypto')
const Swarm = require('discovery-swarm')
const defaults = require('dat-swarm-defaults')
const getPort = require('get-port')
const readline = require('readline')
const sign = require('./libs/sign.js')
require('dotenv').config()

const peers = {}
let connSeq = 0
let rl

const askUser = async () => {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('Write a message to broadcast..\r\n', message => {
    sign.signWithKey(process.env.NODE_KEY, message).then(signature => {
      signature.message = message
      broadCast(JSON.stringify(signature))
      rl.close()
      rl = undefined
      askUser()
    })
  });
}

const NodeID = crypto.randomBytes(32)
console.log('Your identity: ' + NodeID.toString('hex'))

const broadCast = async (message) => {
  console.log('Broadcasting to peers: ' + message)
  for (let id in peers) {
    peers[id].conn.write(message)
  }
}

const config = defaults({
  id: NodeID,
})

const sw = Swarm(config)

;(async () => {

  const port = await getPort()

  sw.listen(port)
  console.log('Listening to port: ' + port)

  sw.join(process.env.SWARM_CHANNEL)

  sw.on('connection', (conn, info) => {
    const seq = connSeq

    const peerId = info.id.toString('hex')
    console.log(`Connected #${seq} to peer: ${peerId}`)

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
        sign.verifySign(received.pubKey, received.signature, received.message).then(signature => {
          if(signature === true){
            console.log('Received valid message from ' + received.pubKey + ': ' + received.message)
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

    // Save the connection
    if (!peers[peerId]) {
      peers[peerId] = {}
    }
    peers[peerId].conn = conn
    peers[peerId].seq = seq
    connSeq++

  })
  
  askUser()

})()