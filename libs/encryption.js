const crypto = require('crypto')
const fs = require('fs')

module.exports = {
    encryptMessage: async function(toEncrypt, keyPath) {
        return new Promise(response => {
            var publicKey = fs.readFileSync(keyPath, "utf8")
            var buffer = Buffer.from(toEncrypt)
            var encrypted = crypto.publicEncrypt(publicKey, buffer)
            response(encrypted.toString("base64"))
        })
    },
    decryptMessage: async function(toDecrypt, keyPath) {
        return new Promise(response => {
            var privateKey = fs.readFileSync(keyPath, "utf8");
            var buffer = Buffer.from(toDecrypt, "base64");
            const decrypted = crypto.privateDecrypt(
                {
                    key: privateKey.toString()
                },
                buffer,
            )
            response(decrypted.toString("utf8"))
        })
    },
    generateKeys: function(){
        const { publicKey, privateKey } = 
            crypto.generateKeyPairSync(
                'rsa', 
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
                }
            )

            if (!fs.existsSync('keys/private.pem')) {
                fs.writeFileSync('keys/private.pem', privateKey)
                fs.writeFileSync('keys/public.pem', publicKey)
            }
    }
};