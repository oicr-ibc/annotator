// Service implementation. Nothing much to see here, move along please.

var app = module.parent.exports.app,
    config = module.parent.exports.config,
    logger = module.parent.exports.logger;

var uuid = require('uuid');
var path = require('path');
var spawn = require('child_process').spawn;
var fs = require('fs');
var url = require('url');
var http = require('http');
var send = require('send');
var rimraf = require('rimraf');

var basedir = config['basedir'];
var datadir = config['datadir'];
var baseurl = config['baseurl'];
var commandsdir = config['commandsdir'];

var pidfile = ".pid";
var statusfile = ".status";
var outfile = ".stdout";
var errfile = ".stderr";

// Basic use of a file system for managing the process service. Basically, 
// every workflow is implemented as a process. What happens before there, we
// don't need to worry ourselves about. The basic model is that a POST 
// generates a UUID, and this is the root for a pid file, and for stdout
// and stderr files. The UUID is returned and used as a key. The UUID
// actually is run as a directory, so the workflow is run within a given
// working directory and can write other stuff there for us to pick up
// using whatever systems we choose. 

app.get('/annotation', function(req, res) {
	var response = {};
	response['api'] = 'ca.on.oicr.ibc.annotation',
	response['annotationUrl'] = url.resolve(baseurl, "annotation");
	response['status'] = 200;
	response['version'] = config['version'];
	res.send(200, response);
});

/**
 * Creating a workflow instance, we simply generate a directory and a UUID
 * and return the UUID. We should also use a command parameter, which will
 * specify the workflow we will actually run. This is implemented by copying
 * a script file into the correct location. 
 */
app.post('/annotation', function(req, res) {
	var identifier = uuid.v4();
	var directory = path.join(datadir, identifier);

	fs.mkdir(directory, function(err) {
		if (err) res.send(500, http.STATUS_CODES[500]);
		var response = {};
		response['identifier'] = identifier;
		response['annotationFilesUrl'] = url.resolve(baseurl, "annotation/" + identifier + "/files");
		response['annotationStatusUrl'] = url.resolve(baseurl, "annotation/" + identifier + "/status");
		response['annotationDeleteUrl'] = url.resolve(baseurl, "annotation/" + identifier);
		response['status'] = 201;
		res.send(201, response);
	});
});

app.put('/annotation/:id/status', function(req, res) {
	var running = req.query['running'];
	if (running == 'true') {
		return startProcess(req, res);
	} else if (running == 'false') {
		return res.send(501, http.STATUS_CODES[501]);
		return stopProcess(req, res);
	} else {
		return res.send(404, http.STATUS_CODES[404]);
	}
});

// Starts a process with a wrapper script, written in node, which ensures we have a .pid,
// a .status, a .stdout, and a .stderr. Each of these can be requested using the ../files
// endpoint, which can be used for both get and post.
function startProcess(req, res) {
	var command = path.resolve(commandsdir, path.basename(req.query['command']));
	inDirectory(req.params['id'], function(err, directory) {

		var execPath = process.execPath;
		var execArgv = process.execArgv;
		var wrapperPath = path.resolve(basedir, 'wrapper.js');

		logger.info("Executing", execPath, "with", wrapperPath, command, "in", directory);

		var child = spawn(execPath, [wrapperPath, command], {
			cwd: directory,
			detached: true,
			stdio: [ 'ignore', 'ignore', 'ignore' ]
		});
		child.on('error', function(err) {
			return res.send(500, err);
		});
		child.unref();
		return res.send(200, err);
	});
}

/**
 * Uploading a file to a workflow is also fairly easy. We just write out the
 * data into the UUID-based directory. We're using a multipart-type format 
 * (obviously) so we have a file name as well as a file body.
 */

function inDirectory(identifier, callback) {
	if (! identifier) return callback({error: "Missing identifier"}, null);
	var directory = path.join(datadir, identifier);

	fs.stat(directory, function(err, stats) {
		if (err) return callback(err, null);
		if (! stats.isDirectory()) return callback(null, null);
		return callback(null, directory);
	});
}

app.post('/annotation/:id/files', function(req, res) {
	inDirectory(req.params['id'], function(err, directory) {
		if (err) return res.send(500, http.STATUS_CODES[500]);
		if (! directory) return res.send(404, http.STATUS_CODES[404]);

		var incomingForm = req.form;
		incomingForm.on('error', function(err) {
			return res.send(500, http.STATUS_CODES[500]);
		});
		incomingForm.on('file', function(name, file) {
			var targetFilePath = path.resolve(directory, path.basename(name));
			copyFile(file.path, targetFilePath, function(err) {
				if (err) return res.send(500, http.STATUS_CODES[500]);
			});
		});
		incomingForm.on('end', function() {
			res.send(201, http.STATUS_CODES[201]);
		});
		incomingForm.parse(req);
	});
});

function copyFile(from, to, callback) {
	var readStream = fs.createReadStream(from);
  	readStream.on("error", function(err) {
    	return callback(err);
  	});
  	var writeStream = fs.createWriteStream(to);
  	writeStream.on("error", function(err) {
    	return callback(err);
  	});
  	writeStream.on("close", function(ex) {
  		return callback(null);
  	});	
  	readStream.pipe(writeStream);
}

/**
 * Returns the file contents for a given (named) file. This allows completed
 * data to be returned when it is available. 
 */
app.get('/annotation/:id/files/:name', function(req, res) {
	var identifier = req.params['id'];

	// We don't actually need the inDirectory handling (or do we?) because we
	// are just sending back a file, so a 404 is a natural consequence of the
	// file not being there. However, do make sure we don't cache file contents.

	var directory = path.resolve(datadir, path.basename(identifier));
	var file = path.resolve(directory, path.basename(req.params['name']));

	if (!res.getHeader('Cache-Control')) {
		res.setHeader('Cache-Control', 'public, max-age=0');
	}

	send(req, file)
	  .hidden(true)
  	  .on('error', function(err) { return res.send(404, http.STATUS_CODES[404]); })
  	  .pipe(res);
});

app.delete('/annotation/:id', function(req, res) {
	var identifier = req.params['id'];
	var directory = path.resolve(datadir, path.basename(identifier));
	rimraf(directory, function(err) {
		if (err)
			return res.send(500, err);
		else
			return res.send(200, err);
	});
});