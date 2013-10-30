// Service implementation. Nothing much to see here, move along please.

var app = module.parent.exports.app,
    config = module.parent.exports.config,
    logger = module.parent.exports.logger;

var uuid = require('uuid');
var path = require('path');
var spawn = require('child_process').spawn;
var fs = require('fs');

var basedir = config['basedir'];
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

/**
 * Creating a workflow instance, we simply generate a directory and a UUID
 * and return the UUID. We should also use a command parameter, which will
 * specify the workflow we will actually run. This is implemented by copying
 * a script file into the correct location. 
 */
app.post('/annotator', function(req, res) {
	var identifier = uuid.v4();
	var directory = path.join(basedir, identifier);

	fs.mkdir(directory, function(err) {
		if (err) res.send(500, http.STATUS_CODES[500]);
		var response = {};
		response['identifier'] = identifier;
		response['annotationStatusUrl'] = url.resolve(baseurl, "annotation/" + identifier + "/status");
		response['annotationFilesUrl'] = url.resolve(baseurl, "annotation/" + identifier + "/files");
		response['status'] = 201;
		res.send(201, response);
	});
});

app.put('/annotation/:id/status', function(req, res) {
	var running = req.params['running'];
	if (running == 'true') {
		return startProcess(req, res);
	} else if (running == 'false') {
		return stopProcess(req, res);
	} else {
		return res.send(400, http.STATUS_CODES[404]);
	}
});

// Starts a process with a wrapper script, written in node, which ensures we have a .pid,
// a .status, a .stdout, and a .stderr. Each of these can be requested using the ../files
// endpoint, which can be used for both get and post.
function startProcess(req, res) {
	var command = path.resolve(commandsdir, path.basename(req.params['command']));
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
		child.unref();
		child.on('error', function(err) {
			return res.send(500, err);
		});
	});
}

/**
 * Uploading a file to a workflow is also fairly easy. We just write out the
 * data into the UUID-based directory. We're using a multipart-type format 
 * (obviously) so we have a file name as well as a file body.
 */

function inDirectory(identifier, callback) {
	if (! identifier) return callback({error: "Missing identifier"}, null);
	var directory = path.join(basedir, identifier);

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

		var files = req.files.files;
		return storeFiles(directory, files, {}, function(err) {
			if (err) return res.send(500, err);
			res.send(201, http.STATUS_CODES[201])
		});
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
}

function storeFiles(directory, files, data, callback) {
	if (files.length === 0)
		return callback(null, data);

	var file = files.shift();
	var name = file.name;
	var path = file.path;

	// Create path. We use basename to prevent path hacking. And yes, this
	// does mean that everything is within a single flat directory. 

	var targetFilePath = path.resolve(directory, path.basename(name));
	copyFile(path, targetFilePath, function(err) {
		if (err) return callback(err);
		return storeFiles(directory, files, data, callback);
	});
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

	var directory = path.resolve(basedir, path.basename(identifier));
	var file = path.resolve(directory, path.basename(req.params['name']));

	if (!res.getHeader('Cache-Control')) {
		res.setHeader('Cache-Control', 'public, max-age=0');
	}
	res.sendfile(file);
});