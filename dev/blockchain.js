const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
const uuid = require('uuid');

function Blockchain() {
    this.chain = [];
    this.pendingTransactions = [];

    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes = [];

    this.createNewBlock(100, '0', '0');
}


Blockchain.prototype.createNewBlock = function (nonce, previousBlockHash, hash) {
    const newBlock = {
        index: this.chain.length + 1,
        timestamp: Date.now(),
        transactions: this.pendingTransactions,
        nonce: nonce, //proof of work parameter
        hash: hash, // hash code
        previousBlockHash: previousBlockHash // previous block hash
    };

    this.pendingTransactions = [];
    this.chain.push(newBlock);

    return newBlock;
}

Blockchain.prototype.getLastBlock = function () {
    return this.chain[this.chain.length - 1];
}

Blockchain.prototype.createNewTransaction = function (amount, sender, recipent) {
    const newTransaction = {
        amount: amount,
        sender: sender,
        recipent: recipent,
        transactionId: uuid.v1().split('-').join('')
    };

    return newTransaction;
}

Blockchain.prototype.addTranasctionToPendingTransaction = function (transaction) {
    this.pendingTransactions.push(transaction);

    return this.getLastBlock()['index'] + 1;
}

Blockchain.prototype.hasBlock = function (previousBlockHash, currenctBlockData, nonce) {
    const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currenctBlockData);
    const hash = sha256(dataAsString);
    return hash;
}

Blockchain.prototype.proofOfWork = function (previousBlockHash, currenctBlockData) {
    let nonce = 0;
    let hash = this.hasBlock(previousBlockHash, currenctBlockData, nonce);
    while (hash.substring(0, 4) !== '0000') {
        nonce++;
        hash = this.hasBlock(previousBlockHash, currenctBlockData, nonce);
    }

    return nonce;
}

Blockchain.prototype.chainIsValid = function (blockchain) {
    let validChain = true;
    for (var i = 1; i < blockchain.length; i++) {
        const currentBlock = blockchain[i];
        const previousBlock = blockchain[i - 1];
        const blockHash = this.hasBlock(previousBlock['hash'], { transactions: currentBlock['transactions'], index: currentBlock['index'] }, currentBlock['nonce']);
        if (blockHash.substring(0, 4) !== '0000') validChain = false;
        if (currentBlock['previousBlockHash'] !== previousBlock['hash']) { //chain is not valid
            validChain = false;
        }
    }

    const genesisBlock = blockchain[0];
    const correctNonce = genesisBlock['nonce'] === 100;
    const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
    const correctHash = genesisBlock['hash'] === '0';
    const correctTransactions = genesisBlock['transactions'].length === 0;

    if (!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions) validChain = false;

    return validChain;
}

Blockchain.prototype.getBlock = function (blockHash) {
    let correctBlock = null;
    this.chain.forEach((block) => {
        if (blockHash == block.hash) {
            correctBlock = block;
        }
    });

    return correctBlock;
}

Blockchain.prototype.getTransaction = function (transactionId) {
    let correctTransaction = null;
    let correctBlock = null;
    this.chain.forEach((block) => {
        block.transactions.forEach((transaction) => {
            if (transaction.transactionId == transactionId) {
                correctTransaction = transaction;
                correctBlock = block
            }
        });
    });

    return { transaction: correctTransaction, block: correctBlock };
}

Blockchain.prototype.getAddressData = function(address) {
	const addressTransactions = [];
	this.chain.forEach(block => {
		block.transactions.forEach(transaction => {
			if(transaction.sender === address || transaction.recipient === address) {
				addressTransactions.push(transaction);
			};
		});
	});

	let balance = 0;
	addressTransactions.forEach(transaction => {
		if (transaction.recipient === address) balance += transaction.amount;
		else if (transaction.sender === address) balance -= transaction.amount;
	});

	return {
		addressTransactions: addressTransactions,
		addressBalance: balance
	};
};


module.exports = Blockchain;