var fs = require("fs"),
    express = require('express')
    nconf = require('nconf'),
    winston = require('winston');

var logger = new (winston.Logger)({
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
  'server:port': 3000,
  'server:address': "0.0.0.0",
  'debug': true
});

var app = module.exports.app = express();

var config = nconf.get();
module.exports.config = config;

app.configure(function(){
  app.locals.pretty = true;

  app.use(express.static(process.cwd() + '/webapp', { maxAge: 1000 * 60 * 60 * 24 }));
  app.use(express.logger('dev'));

  app.use(express.methodOverride());
  app.use(express.bodyParser({
    keepExtensions: true,
    limit: 10000000, // 10M limit
    defer: true  
  }));

  app.use(express.cookieParser());
  app.use(express.session({
    secret: config["cookieSecret"]
  }));
  app.use(app.router);
  app.use(logErrors);
  app.use(errorHandler);

  // Unusually, we don't have global authorization here, although we could. This allows
  // the knowledge base to have public read access, without allowing access to the tracker
  // without logging in. The session here doesn't block access in the absence of a session,
  // but it does populate the session. To restrict, the authentication system needs to 
  // verify the existence of req.user for routes that we need authenticated. 
});

function logErrors(err, req, res, next) {
  logger.error(err.stack);
  next(err);
}

function errorHandler(err, req, res, next) {
  res.status(500);
  res.render('error', { error: err });
}

if(!process.argv[2] || !process.argv[2].indexOf("expresso")) {
  app.listen(config['server']['port'], config['server']['address']);
  logger.info(("Express server listening on port " + config['server']['port']));
}