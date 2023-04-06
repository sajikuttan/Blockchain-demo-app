const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const uuid = require('uuid');
const rp = require('request-promise');
const Blockchain = require('./blockchain');

const port = process.argv[2];
const nodeAddress = uuid.v1().split('-').join('');

const bitcoin = new Blockchain();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/blockchain', function (req, res) {
    res.send(bitcoin);
});

app.post('/transaction', function (req, res) {
    const newTransaction = req.body;
    const blockIndex = bitcoin.addTranasctionToPendingTransaction(newTransaction);
    res.json({
        'message': `Transaction will be added in block ${blockIndex}`,
        status: 200
    });
});

app.post('/transaction/broadcast', function (req, res) {
    let data = req.body;
    const newTransaction = bitcoin.createNewTransaction(data.amount, data.sender, data.recipent);
    bitcoin.addTranasctionToPendingTransaction(newTransaction);
    const requestPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true
        };
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises).then((data) => {
        res.json({
            "message": "New transaction created and broadcast successfully",
            status: 200
        });
    });
});

app.get('/mine', function (req, res) {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];
    const currenctBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock['index'] + 1,
    };
    const nonce = bitcoin.proofOfWork(previousBlockHash, currenctBlockData);
    const currentBlockHash = bitcoin.hasBlock(previousBlockHash, currenctBlockData, nonce);
    const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, currentBlockHash);
    const rgNodesPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/recieve-new-block',
            method: 'POST',
            body: {
                newBlock: newBlock
            },
            json: true
        };
        rgNodesPromises.push(rp(requestOptions));
    });
    Promise.all(rgNodesPromises).then((data) => {
        const reqOption = {
            uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
            method: 'POST',
            body: {
                "amount": 12.5,
                "sender": "00",
                "recipent": nodeAddress
            },
            json: true
        }
        return rp(reqOption)
    }).then((data) => {
        res.json({
            'message': `New Block mined and broadcast successfully`,
            'block': newBlock,
            status: 200
        });
    });
});

app.post('/recieve-new-block', function (req, res) {
    let newBlock = req.body.newBlock;
    const lastBlock = bitcoin.getLastBlock();
    const correctHash = (lastBlock.hash === newBlock.previousBlockHash);
    const correctIndex = ((lastBlock['index'] + 1) === newBlock['index']);
    if (correctHash && correctIndex) {
        bitcoin.chain.push(newBlock);
        bitcoin.pendingTransactions = [];
        res.json({
            'message': `New Block received and accepted`,
            "newBlock": newBlock,
            status: 200
        });
    } else {
        res.json({
            'message': `New Block rejected`,
            "newBlock": newBlock,
            status: 200
        });
    }

});

//register a node and broadcast it the network
app.post('/register-and-broadcast-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1) {
        bitcoin.networkNodes.push(newNodeUrl);
    }

    const rgNodesPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: {
                newNodeUrl: newNodeUrl
            },
            json: true
        };
        rgNodesPromises.push(rp(requestOptions));
    });
    Promise.all(rgNodesPromises).then((data) => {
        const bulkRequestOptions = {
            uri: newNodeUrl + '/register-nodes-bulk',
            method: 'POST',
            body: {
                allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl]
            },
            json: true
        };
        return rp(bulkRequestOptions);
    }).then((data) => {
        res.json({
            "message": "New node registered successfully",
            status: 200
        })
    });
});

//register a node with the network
app.post('/register-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl;
    //checking node url is present or not
    const nodeNoteAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
    //checking the new node url is not the current node url
    const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
    if (nodeNoteAlreadyPresent && notCurrentNode) {
        bitcoin.networkNodes.push(newNodeUrl);
    }
    res.json({
        "message": "New node registered successfully",
        status: 200
    })

});


//register multiple nodes with the network
app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes;
    let i = 0;
    let allNetworkNodesPromise = new Promise((resolve, rejct) => {
        allNetworkNodes.forEach((networkNodeUrl) => {
            i++;
            //checking node url is present or not
            const nodeNoteAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
            //checking the new node url is not the current node url
            const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
            if (nodeNoteAlreadyPresent && notCurrentNode) {
                bitcoin.networkNodes.push(networkNodeUrl);
            }
            if (i == allNetworkNodes.length) {
                resolve(1)
            }
        });
    });
    allNetworkNodesPromise.then((result) => {
        if (result) {
            res.json({
                "message": "Bulk registration successfully",
                status: 200
            })
        }
    });
});

app.get('/consensus', function (req, res) {

    const requestPromises = []
    // request /blockchain to all nodes
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/blockchain',
            method: "GET",
            json: true
        }
        requestPromises.push(rp(requestOptions));
    });

    // will get array of blockchain from all nodes
    Promise.all((requestPromises)).then((blockchains) => {
        const currentChainLength = bitcoin.chain.length; //current block chain length
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingTransactions = null;

        blockchains.forEach((blockchain) => {
            /* if there is any longer chain maxChainLength is set to that blockchain's length, newLongestChain is set to that blockchain and newPendingTransactions is set to that blockchain's pendingTransactions */
            if (blockchain.chain.length > maxChainLength) {
                maxChainLength = blockchain.chain.length;
                newLongestChain = blockchain.chain;
                newPendingTransactions = blockchain.pendingTransactions;
            }
        });

        //  if there is no longer chain in the node and chain is not valid then the chain is not replaced
        if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
            res.json({
                "message": "Current chain has not been replaced",
                "chain": bitcoin.chain,
                status: 200
            });
        } else { //if there is longer chain in node the replace with the longer chain if (newLongestChain && bitcoin.chainIsValid(newLongestChain))
            bitcoin.chain = newLongestChain;
            bitcoin.pendingTransactions = newPendingTransactions;
            res.json({
                "message": "Current chain has been replaced",
                "chain": bitcoin.chain,
                status: 200
            });
        }
    });
});


app.get("/block/:blockHash", function (req, res) {
    const blockHash = req.params.blockHash;
    const correctBlock = bitcoin.getBlock(blockHash);
    res.json({
        "block": correctBlock,
        status: 200
    });
});


app.get("/transaction/:transactionId", function (req, res) {
    const transactionId = req.params.transactionId;
    const correctTransaction = bitcoin.getTransaction(transactionId);
    res.json({
        "transaction": correctTransaction,
        status: 200
    });
});


app.get("/address/:address", function (req, res) {
    const address = req.params.address;
    const addressData = bitcoin.getAddressData(address);
    res.json({
        addressData: addressData,
        status: 200
    });
});

// block explorer
app.get('/block-explorer', function (req, res) {
    res.sendFile('./block-explorer/index.html', { root: __dirname });
});


app.listen(port, () => {
    console.log(`listening on port ${port}...`);
});