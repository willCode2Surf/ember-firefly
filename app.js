var  app = require('http').createServer() 
    ,io = require('socket.io').listen(app)
    ,redis = require('redis');
    
app.listen(6969);

io.configure( function() {
	io.set('close timeout', 60*60*3); // 3HR time out
});

function SessionController (user) {
	this.sub = redis.createClient();
	this.pub = redis.createClient();
	this.user = user;
}

SessionController.prototype.subscribe = function(socket) {
	this.sub.on('message', function(channel, message) {
		socket.emit(channel, message);
	});
	var current = this;
	this.sub.on('subscribe', function(channel, count) {
		var joinMessage = JSON.stringify({action: 'control', user: current.user, msg: ' joined the channel' });
		current.publish(joinMessage);
	});
	this.sub.subscribe('chat');
};

SessionController.prototype.rejoin = function(socket, message) {
	this.sub.on('message', function(channel, message) {
		socket.emit(channel, message);
	});
	var current = this;
	this.sub.on('subscribe', function(channel, count) {
		var rejoin = JSON.stringify({action: 'control', user: current.user, msg: ' rejoined the channel' });
		current.publish(rejoin);
		var reply = JSON.stringify({action: 'message', user: message.user, msg: message.msg });
		current.publish(reply);
	});
	this.sub.subscribe('core');
};

SessionController.prototype.unsubscribe = function() {
	this.sub.unsubscribe('core');
};

SessionController.prototype.publish = function(message) {
	this.pub.publish('core', message);
};

SessionController.prototype.destroyRedis = function() {
	if (this.sub !== null) this.sub.quit();
	if (this.pub !== null) this.pub.quit();
};

io.sockets.on('connection', function (socket) { // the actual socket callback
	console.log(socket.id);
	socket.on('data', function (data) { // receiving data package
		var msg = JSON.parse(data);
		socket.get('sessionController', function(err, sessionController) {
			if (sessionController === null) {
				// implicit 
				var newSessionController = new SessionController(msg.user);
				socket.set('sessionController', newSessionController);
				newSessionController.rejoin(socket, msg);
			} else {
				var reply = JSON.stringify({action: 'data', user: msg.user, msg: msg.msg });
				sessionController.publish(reply);
			}
		});

		console.log(data);
	});

	socket.on('join', function(data) {
		var msg = JSON.parse(data);
		var sessionController = new SessionController(msg.user);
		socket.set('sessionController', sessionController);
		sessionController.subscribe(socket);

		console.log(data);
	});

	socket.on('disconnect', function() { // disconnect from a socket - might happen quite frequently depending on network quality
		socket.get('sessionController', function(err, sessionController) {
			if (sessionController === null) return;
			sessionController.unsubsscribe();
			var leaveMessage = JSON.stringify({action: 'control', user: sessionController.user, msg: ' left the channel' });
			sessionController.publish(leaveMessage);
			sessionController.destroyRedis();
		});
	});
});


