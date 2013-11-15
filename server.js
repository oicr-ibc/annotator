var fs = require("fs"),
    express = require('express')
    nconf = require('nconf'),
    path = require('path'),
    winston = require('winston');

var logger = module.exports.logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({colorize: true, timestamp: true}),
  ]
});

var configFile = process.cwd()+"/config.json";
logger.info("Configuring from: " + configFile);

nconf
  .use('memory')
  .argv()
  .env()
  .file({ file: configFile });

nconf.defaults({
  'server:port': 3001,
  'server:address': "0.0.0.0",
  'basedir': ".",
  'datadir': ".",
  'baseurl': "http://localhost:3001/",
  'commandsdir': path.resolve(__dirname, 'commands'),
  'debug': true,
  'version': '1.0'
});

var app = module.exports.app = express();

var config = nconf.get();
module.exports.config = config;

app.configure(function(){
  app.locals.pretty = true;
  app.use(express.logger('dev'));

  app.use(express.methodOverride());
  app.use(express.bodyParser({
    keepExtensions: true,
    limit: 10000000, // 10M limit
    defer: true  
  }));

  app.use('/swagger', express.static(__dirname + '/swagger'));
  app.use(app.router);
  app.use(logErrors);
  app.use(errorHandler);

  // Unusually, we don't have global authorization here, although we could. This allows
  // the knowledge base to have public read access, without allowing access to the tracker
  // without logging in. The session here doesn't block access in the absence of a session,
  // but it does populate the session. To restrict, the authentication system needs to 
  // verify the existence of req.user for routes that we need authenticated. 
});

require('./lib/service');

function logErrors(err, req, res, next) {
  logger.error(err.stack);
  next(err);
}

function errorHandler(err, req, res, next) {
  res.send(500, { error: err });
}

if(!process.argv[2] || !process.argv[2].indexOf("expresso")) {
  app.listen(config['server']['port'], config['server']['address']);
  logger.info(("Express server listening on port " + config['server']['port']));
}

