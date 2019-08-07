global['relayed'] = {
    messages: {},
    keys: {}
}

global['broadcasted'] = {
    nodes: [],
    clients: []
}

global['feed'] = {}

module.exports = {
    broadcast: async function(protocol, message, socketID = '', nodeID = '') {
        //console.log('Broadcasting to network..')
        if(nodeID === ''){
            for (let id in global['nodes']) {
                global['nodes'][id].emit(protocol, message)
            }
        }else{
            if(global['nodes'][nodeID]){
                global['nodes'][nodeID].emit(protocol, message)
            }
        }
        if(socketID === ''){
            global['io'].server.sockets.emit(protocol, message)
            console.log('Broadcast to every connected client..')
        }else{
            global['io'].sockets[socketID].emit(protocol, message)
            console.log('Broadcast to client ' + socketID)
        }
    },
    relay: async function(message){
        console.log('Relaying message to clients...')
        global['io'].server.sockets.clients((error, clients) => {
            for(var k in clients){
                var client = clients[k]
                if(!global['relayed']['messages'][client]){
                    global['relayed']['messages'][client] = []
                }
                if(global['relayed']['messages'][client].indexOf(message.signature) === -1){
                    global['relayed']['messages'][client].push(message.signature)
                    this.broadcast('message', message, client)
                }
            }
        })
    }
};