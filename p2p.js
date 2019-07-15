const crypto = require('crypto')
const Swarm = require('discovery-swarm')
const defaults = require('dat-swarm-defaults')
const getPort = require('get-port')
const readline = require('readline')
const sign = require('./libs/sign.js')
require('dotenv').config()
const fs = require('fs')

const peers = {}
let connSeq = 0
let rl

//COMMUNICATION FUNCTIONS
const askUser = async () => {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('Write a message to broadcast..\r\n', message => {
    let encrypted = encryptMessage(message, "keys/public.pem")
    sign.signWithKey(process.env.NODE_KEY, encrypted).then(signature => {
      signature.message = encrypted
      broadCast(JSON.stringify(signature))
      rl.close()
      rl = undefined
      askUser()
    })
  });
}
//COMMUNICATION FUNCTIONS

const broadCast = async (message) => {
  console.log('Broadcasting to peers: ' + message)
  for (let id in peers) {
    peers[id].conn.write(message)
  }
}

//SWARM
const NodeID = crypto.randomBytes(32)
console.log('Your identity: ' + NodeID.toString('hex'))

const config = defaults({
  id: NodeID,
})

const sw = Swarm(config)
//SWARM

//ENCRYPTION
const generateKeys = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', 
  {
          modulusLength: 4096,
          namedCurve: 'secp256k1',
          publicKeyEncoding: {
              type: 'spki',
              format: 'pem'     
          },     
          privateKeyEncoding: {
              type: 'pkcs8',
              format: 'pem'
          } 
  });

  if (!fs.existsSync('keys/private.pem')) {
    fs.writeFileSync('keys/private.pem', privateKey)
    fs.writeFileSync('keys/public.pem', publicKey)
  }
}

var encryptMessage = function(toEncrypt, keyPath) {
  var publicKey = fs.readFileSync(keyPath, "utf8");
  var buffer = Buffer.from(toEncrypt);
  var encrypted = crypto.publicEncrypt(publicKey, buffer);
  return encrypted.toString("base64");
};

var decryptMessage = function(toDecrypt, keyPath) {
  var privateKey = fs.readFileSync(keyPath, "utf8");
  var buffer = Buffer.from(toDecrypt, "base64");
  const decrypted = crypto.privateDecrypt(
      {
          key: privateKey.toString()
      },
      buffer,
  )
  return decrypted.toString("utf8");
}
//ENCRYPTION

;(async () => {

  const port = await getPort()

  sw.listen(port)
  console.log('Listening to port: ' + port)

  sw.join(process.env.SWARM_CHANNEL)

  sw.on('connection', (conn, info) => {
    const seq = connSeq

    const peerId = info.id.toString('hex')

    if (!peers[peerId]) {
      peers[peerId] = {}
      console.log(`Connected #${seq} to peer: ${peerId}`)
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
        sign.verifySign(received.pubKey, received.signature, received.message).then(signature => {
          if(signature === true){
            console.log('Received valid message from ' + received.pubKey + ': ' + received.message)
            try{
              var decrypted = decryptMessage(received.message, 'keys/private.pem')
              console.log("Successfully decrypted message: " + decrypted)
            }catch(e){
              console.log('Can\'t decrypt the message.')
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
  
  askUser()
  generateKeys()

})()