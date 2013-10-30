// This file is started with node.js as a wrapper for a command workflow.
// It will be run in a working directory for a workflow. It will be detached
// from the parent process. It's job primarily is to start the appropriate
// command, manage the .pidfile and the .status, the .stdout and .stderr 
// files. It doesn't attempt to notify exit, apart from creating the .status.
//
// Only one argument is used, the file location for the executable, typically
// a shell or other executable. This is intentional. The more flexibility we
// allow the caller, the more the caller needs to worry about differences in
// versioning. There will typically only be a single endpoint scrip to call
// anyway. 

var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');

var executable = process.argv[2];
var cwd = process.cwd();

var pidfile = path.resolve(cwd, ".pid");
var statusfile = path.resolve(cwd, ".status");
var outfile = path.resolve(cwd, ".stdout");
var errfile = path.resolve(cwd, ".stderr");

if (! executable) {
	return exit(256);
}

fs.open(outfile, 'w', function (err, outfd) {
	if (err) return exit(257);
	fs.open(errfile, 'w', function (err, errfd) {
		if (err) return exit(258);

		var child = spawn(executable, [], {
			cwd: cwd,
			detached: false,
			stdio: [ 'ignore', outfd, errfd ]
		});

		write_value_to_path(pidfile, child.pid.toString(), function() {});

		child.on('exit', function (code) {
  			exit(code);
		});
	});
});

// Write a status code. Note we assume working directory. 
function write_value_to_path(path, code, callback) {
	var stream = fs.createWriteStream(path);
	stream.end(code, callback);
}

// Handy function to write a status code and then quit this node
// process.
function exit(code) {
	write_value_to_path(statusfile, code.toString(), function() {
		return process.exit(code);			
	});
}