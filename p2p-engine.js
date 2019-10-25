require('dotenv').config()
const crypto = require('crypto')
const sign = require('./libs/sign.js')
const encryption = require('./libs/encryption.js')
const utilities = require('./libs/utilities.js')
const messages = require('./libs/messages.js')
const request = require('request')
var argv = require('minimist')(process.argv.slice(2))
const app = require('express')()
const isPortAvailable = require('is-port-available')
var server = require('http').Server(app)

global['io'] = { server: null, client: null, sockets: {} }
global['io'].server = require('socket.io')(server)
const getPort = require('get-port')
var dns = require('dns')
const publicIp = require('public-ip');

global['clients'] = {}
global['nodes'] = {}
global['connected'] = {}

let hook

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

  app.get('/', (req, res) => res.send('Scrypta P2P Engine is online'))
  app.post('/broadcast', async (req,res) => {
    var parsed = await utilities.parse(req)
    var body = parsed.body
    if(body.message !== undefined){
      let broadcasted = await messages.broadcast(body.message)
      res.send({success: true, broadcasted: broadcasted})
    }else{
      res.send({error: true, message: 'Specify message first.'})
    }
  })
  app.listen(expressPort, () => console.log(`Communications API listening on port: ${expressPort}`))  
  encryption.generateKeys()
  console.log('Starting P2P client.')
  global['identity'] = await sign.returnAddress(process.env.NODE_KEY)

  console.log('Identity loaded: ' + global['identity'])

  let bootstrap = process.env.BOOTSTRAP_NODES.split(',')
  for (var k in bootstrap) {
      if (!global['clients'][bootstrap[k]]) {
          //INIT CONNECTION
          let lookupURL = bootstrap[k].replace('http://', '').replace(':' + process.env.PORT, '')
          let ip = await lookup(lookupURL)
          let publicip = await publicIp.v4()
          let node = bootstrap[k]

          if (ip !== publicip) {
              console.log('Bootstrap connection to ' + bootstrap[k])
              global['nodes'][node] = require('socket.io-client')(node, { reconnect: true })
              global['nodes'][node].on('connect', function () {
                  console.log('Connected to peer: ' + global['nodes'][node].io.uri)
                  global['connected'][node] = true
              })
              global['nodes'][node].on('disconnect', function () {
                  console.log('Disconnected from peer: ' + global['nodes'][node].io.uri)
                  global['connected'][node] = false
              })

              //PROTOCOLS
              global['nodes'][bootstrap[k]].on('message', function (data) {
                  console.log('Received message from network.')
                  request.post(hook, received, function (error, response, body) {
                    if(error){
                      console.log('Hook failed.')
                    }
                  })
              })
          }
      }
  }

  //INIT SOCKETIO SERVER
  let p2pport = process.env.PORT;
  console.log('Starting P2P server on port ' + p2pport)
  server.listen(p2pport);
  global['io'].server.on('connection', function (socket) {
      console.log('New peer connected: ' + socket.id)
      global['io'].sockets[socket.id] = socket
      //PROTOCOLS
      socket.on('message', function (data) {
          console.log('Relaying received message to peers.');
          messages.relay(data)
      })

  });
  
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


async function lookup(lookupURL) {
  return new Promise(response => {
      dns.lookup(lookupURL, async function onLookup(err, ip, family) {
          response(ip)
      })
  })
}


initEngine()