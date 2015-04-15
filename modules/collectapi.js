"use strict";
var _ = require("lodash");
var safe = require("safe");
var mongo = require("mongodb");
var crypto = require('crypto');
var moment = require("moment");
var useragent = require("useragent");
var geoip = require('geoip-lite');
var request = require('request');
var zlib = require('zlib');
var newrelic = require("newrelic");
var LRU = require("lru-cache")
  , options = { max: 2000		// it is about 15 contexts
              , length: function (n) { return n.length }
              , dispose: function (key, n) { n.close }
              , maxAge: 1000 * 60 * 60 }
  , cache = LRU(options)
  , otherCache = LRU(50) // sets just the max size 

var buf = new Buffer(35);
buf.write("R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64");

module.exports.deps = ['mongo','prefixify','validate','assets'];

module.exports.init = function (ctx, cb) {
	var prefixify = ctx.api.prefixify.datafix;
	var queryfix = ctx.api.prefixify.queryfix;
    ctx.api.validate.register("error", {$set:{properties:{
        _dt:{type:"date",required:true},
        _idp:{type:"mongoId",required:true},
        _id:{type:"mongoId"},
        _s_reporter:{type:"string",required:true,"maxLength": 64},
        _s_server:{type:"string",required:true,"maxLength": 256},
        _s_logger:{type:"string",required:true,"maxLength": 64},
        _s_message:{type:"string",required:true,"maxLength": 4096},
        _s_culprit:{type:"string",required:true,"maxLength": 1024},
        exception:{type:"object",required:true, properties: {
			_s_type:{type:"string", required:true,"maxLength": 64},
			_s_value:{type:"string", required:true,"maxLength": 4096}
		}},
        action:{type:"object",properties: {
			_s_type:{type:"string", required:true,"maxLength": 64},
			_s_cat:{type:"string", required:true,"maxLength": 1024},
			_s_name:{type:"string", required:true,"maxLength": 1024}
		}},
		stacktrace:{type:"object",required:true, properties: {
			frames:{type:"array",items:{
				type:"object", required:true, properties: {
					_i_col:{type:"integer",required:true},
					_i_line:{type:"integer",required:true},
					_s_file:{type:"string",required:true,"maxLength": 1024},
					_s_func:{type:"string",required:true,"maxLength": 256},
					_s_context:{type:"string",required:true,"maxLength": 4096},
					pre_context:{type:"array",required:true, items:{
						type:"string",required:true,"maxLength": 4096
					}},
					post_context:{type:"array",required:true, items:{
						type:"string",required:true,"maxLength": 4096
					}}
				}
			}}
		}},
		 //client side related data
        _dtc:{type:"date"},
        _dtp:{type:"date"},
        _dtr:{type:"date"},
        agent:{type:"object"},
        chash:{type:"string","maxLength": 256},
        shash:{type:"string","maxLength": 256},
        _idpv:{type:"mongoId"},
        request:{type:"object",properties: {
			_s_route:{type:"string","maxLength": 1024},
			_s_uri:{type:"string", "maxLength": 4096},
			_s_url:{type:"string", "maxLength": 4096},
			headers:{type:"object", patternProperties:{
				".*":{type:"string","maxLength": 1024}
			}}
		}},
		geo:{type:"object"},
        user:{type:"object", patternProperties:{
				".*":{type:"string","maxLength": 1024}
		}},
        extra:{type:"object", patternProperties:{
			".*":[{type:"string","maxLength": 1024},
				{type:"ineteger"}]
		}}
    }}})
	ctx.api.validate.register("action-stats", {$set:{properties:{
		_idp: {type:"mongoId",required:true},
		_s_name: {type:"string",required:true,"maxLength": 4096},
		_s_cat: {type:"string",required:true,"maxLength": 1024},
		_s_type: {type:"string",required:true,"maxLength": 1024},
		_dt: {type:"date",required:true},
		_dts: {type:"date",required:true},
		_dte: {type:"date",required:true},
		data:{type:"array", items:{
			type:"object", required:true, properties: {
				_s_name: {type: "string", required: true, "maxLength": 4096},
				_s_cat: {type: "string", required: true, "maxLength": 1024},
				_s_type: {type: "string", required: true, "maxLength": 1024},
				_i_cnt: {type: "integer", required: true},
				_i_tt: {type: "integer", required: true},
				_i_own: {type: "integer", required: true},
				_i_min: {type: "integer", required: true},
				_i_max: {type: "integer", required: true},
				_i_sqr: {type: "integer", required: true}
			}
		}}
	}}})
	ctx.api.validate.register("actions", {$set:{properties:{
		_idp: {type:"mongoId",required:true},
		_dt: {type:"date",required:true},
		_s_cat: {type:"string",required:true,"maxLength": 1024},
		_s_type: {type:"string",required:true,"maxLength": 1024},
		_s_name: {type:"string",required:true,"maxLength": 4096},
		_i_wt: {type:"integer",required:true},
		_i_tt: {type:"integer",required:true}

	}}})
	ctx.api.validate.register("metrics", {$set:{properties:{
		_idp: {type:"mongoId",required:true},
		_dt: {type:"date",required:true},
		_dts:{type:"date",required:true},
		_dte: {type:"date",required:true},
		_s_type: {type:"string",required:true,"maxLength": 1024},
		_s_name: {type:"string",required:true,"maxLength": 4096},
		_s_pid: {type:"string",required:true,"maxLength": 64},
		_s_host: {type:"string",required:true,"maxLength": 1024},
		_i_cnt: {type:"integer",required:true},
		_f_val: {type:"number",required:true},
		_f_own: {type:"number",required:true},
		_f_min: {type:"number",required:true},
		_f_max: {type:"number",required:true},
		_f_sqr: {type:"number",required:true}
	}}})
	ctx.api.validate.register("ajax", {$set:{properties:{
		_i_nt: {type: "integer", required: true},
		_i_tt: {type: "integer", required: true},
		_i_pt: {type: "integer", required: true},
		_i_code: {type: "integer", required: true},
		_dtc: {type:"date",required:true},
		_dtp: {type:"date",required:true},
		_idp: {type:"mongoId",required:true},
		_dtr: {type:"date",required:true},
		_dt: {type:"date",required:true},
		shash: {type: "string", required: true, "maxLength": 64},
		chash: {type: "string", required: true, "maxLength": 64},
		_s_name: {type: "string", required: true, "maxLength": 1024},
		_s_url: {type: "string", required: true, "maxLength": 4096},
		_idpv: {type: "mongoId"},
		_s_route: {type: "string", "maxLength": 1024},
		_s_uri: {type: "string", "maxLength": 4096}
	}}})
	ctx.api.validate.register("page", {$set:{properties:{
		_i_nt: {type: "integer", required: true},
		_i_tt: {type: "integer", required: true},
		_i_dt: {type: "integer", required: true},
		_i_lt: {type: "integer", required: true},
		_dtc: {type:"date",required:true},
		_dtp: {type:"date",required:true},
		_idp: {type:"mongoId",required:true},
		_dtr: {type:"date",required:true},
		_dt: {type:"date",required:true},
		shash: {type: "string", required: true, "maxLength": 64},
		chash: {type: "string", required: true, "maxLength": 64},
		_s_route:{type: "string", required: true, "maxLength": 1024},
		_s_uri: {type: "string", required: true, "maxLength": 4096},
		_i_err: {type: "integer", required: true},
		agent: {type: "object", required: true},
		geo: {type: "object"}
	}}});
	ctx.api.mongo.getDb({}, safe.sure(cb, function (db) {
		safe.parallel([
			function (cb) {
				db.collection("page_errors",safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{chash:1}, cb); },
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb); },
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dtl:1}, cb); },
						function (cb) { ctx.api.mongo.ensureIndex(col,{ehash:1,_dt:1}, cb); }
					], safe.sure(cb, col));
				}));
			},
			function (cb) {
				db.collection("pages",safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{chash:1}, cb); },
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb); }
					], safe.sure(cb, col));
				}));
			},
			function (cb) {
				db.collection("page_reqs", safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{chash:1}, cb);},
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb);}
					], safe.sure(cb, col));
				}));
			},
			function (cb) {
				db.collection("actions", safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb); }
					], safe.sure(cb, col));
				}));
			},
			function (cb) {
				db.collection("action_stats", safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb); }
					], safe.sure(cb, col));
				}));
			},
			function (cb) {
				db.collection("action_errors", safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb); },
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dtl:1}, cb); },
						function (cb) { ctx.api.mongo.ensureIndex(col,{ehash:1,_dt:1}, cb); }
					], safe.sure(cb, col));
				}));
			},
			function (cb) {
				db.collection("metrics", safe.sure(cb, function (col) {
					safe.parallel([
						function (cb) { ctx.api.mongo.ensureIndex(col,{_idp:1,_dt:1}, cb); }
					], safe.sure(cb, col));
				}));
			}
		],safe.sure_spread(cb, function (events,pages,ajax, actions, as, action_errors, metrics) {
			setInterval(function() {
				var dtlw = new Date(Date.parse(Date()) - 1000*60*60*24*7);
				var q = {_dt: {$lte: dtlw}};
				safe.parallel([
					function() {
						events.remove(q);
					},
					function() {
						pages.remove(q);
					},
					function() {
						ajax.remove(q);
					},
					function() {
						actions.remove(q);
					},
					function() {
						as.remove(q);
					},
					function() {
						action_errors.remove(q);
					},
					function() {
						metrics.remove(q);
					}
				]);
			},1000*60*60);

			ctx.express.post("/agent_listener/invoke_raw_method", function( req, res, next ) {
				function nrParseTransactionName( value ) {
					var _value_array = value.split( "/" );
					var _type = _value_array.length > 1 ? _value_array[0] + "/" + _value_array[1] : "", _name = "";
					for( var i = 2; i < _value_array.length; i++ )
						_name += (_name.length > 0 ? "/" : "") + _value_array[i];
					return { name: _name.length ? _name : "-unknown-", type: _type.length ? _type : "-unknown-" };
				}
				function nrNonFatal(err) {
					// capture NewRelic errors with GetSentry, cool to be doublec backed up
					if (err) {
						if (ctx.locals && ctx.locals.ravenjs)
							ctx.locals.ravenjs.captureError(err);
						else
							console.log(err);
					}
				}
				// extract json data from http request body
				function nrParseBody( req ) {
					return Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
				}
				function nrParseStackTrace_nodejs( st_source, error_dest ) {
					if(!st_source)
						return;
					_.each(st_source, function (line) {
						var si = {pre_context:[],post_context:[],_s_context:"",_s_func:"",_s_file:"",_i_col:0,_i_line:0};
						var _TOKEN = "at ";
						if( line.indexOf( _TOKEN ) >= 0 ) {
							line = line.substr( line.indexOf( _TOKEN ) + _TOKEN.length );
							_TOKEN = "(";
							if( line.indexOf( _TOKEN ) >= 0 ) {
								si["_s_func"] = line.substr( 0, line.indexOf( _TOKEN ) ).trim();
								line = line.substr( line.indexOf( _TOKEN ) + _TOKEN.length );
								line = line.replace( ")", "" );
							}
							_TOKEN = ":";
							if( line.indexOf( _TOKEN ) >= 0 ) {
								si["_s_file"] = line.substr( 0, line.indexOf( _TOKEN ) ).trim();
								line = line.substr( line.indexOf( _TOKEN ) + _TOKEN.length );
								// line number and column number
								var arr_line_items = line.split( ":" );
								if( arr_line_items.length == 2 ) {
									si["_i_line"] = arr_line_items[0];
									si["_i_col"] = arr_line_items[1];
								} else if( arr_line_items.length == 1 ) {
									si["_i_line"] = arr_line_items[0];
								}
							}
							error_dest.stacktrace.frames.push(prefixify(si))
						} else {
							error_dest._s_message = line;
						}
					})
				}
				function nrParseStackTrace_dotnet( st_source, error_dest ) {
					if(!st_source)
						return;
					_.each(st_source, function (line) {
						var si = {pre_context:[],post_context:[],_s_context:"",_s_func:"",_s_file:"",_i_col:0,_i_line:0};
						var _TOKEN = "at ";
						if( line.indexOf( _TOKEN ) >= 0 ) {
							line = line.substr( line.indexOf( _TOKEN ) + _TOKEN.length );
							_TOKEN = " in ";
							if( line.indexOf( _TOKEN ) >= 0 ) {
								si["_s_func"] = line.substr( 0, line.indexOf( _TOKEN ) ).trim();
								line = line.substr( line.indexOf( _TOKEN ) + _TOKEN.length );
								_TOKEN = ":line";
								if( line.indexOf( _TOKEN ) >= 0 ) {
									si["_s_file"] = line.substr( 0, line.indexOf( _TOKEN ) ).trim();
									line = line.substr( line.indexOf( _TOKEN ) + _TOKEN.length );
									// line number and column number
									si["_i_line"] = line.trim();
								}
							} else si["_s_func"] = line;
							error_dest.stacktrace.frames.push(prefixify(si))
						} else {
							error_dest._s_message = line;
						}
					})
				}
				safe.run(function (cb) {
					var nrpc = {
						get_redirect_host:function () {
							// agent ask for reporting host, return by ourselves
							var _host_arr = req.headers.host.split( ":" );
							res.json( { return_value: _host_arr[0] } );
						},
						connect:function () {
							// on connect we should link agent with its project id when available
							var body = nrParseBody(req)[0];
							var agent_name = body.app_name[0];
							// agent name is either project id or name
							var query = prefixify({_id:agent_name});
							if (!query._id)
								query.name = agent_name;

							// check that project exist
							ctx.api.assets.getProject("public", {filter:query}, safe.sure(cb, function (project) {
								if (!project)
									throw new Error( "Project \"" + agent_name + "\" not found" );

								var run = {_idp:project._id, _s_pid:body.pid, _s_logger:body.language, _s_host:body.host};
								res.json({return_value:{"agent_run_id": new Buffer(JSON.stringify(run)).toString('base64')}});
							}))
						},
						agent_settings:function () {
							// seems to be hook to alter agent settings
							// not supported now, just mirror back
							var body = nrParseBody(req);
							if( Array.isArray(body) && body.length > 0 )
								res.json(body[0]);
							else res.json(body);
						},
						metric_data:function () {
							var body = nrParseBody(req);
							var run = prefixify(JSON.parse(new Buffer(req.query.run_id, 'base64').toString('utf8')));

							var _dts = new Date( body[1] * 1000.0 )
								, _dte = new Date( body[2] * 1000.0 )
								, _dt = new Date( (_dts.getTime() + _dte.getTime()) / 2.0 );

							var action_stats = {};
							_.each(body[body.length-1], function (item) {
								// grab memory metrics
								if (item[0].name == "Memory/Physical") {
									var te = prefixify({
										_idp: run._idp
										, _dt: _dt
										, _dts: _dts
										, _dte: _dte
										, _s_type: item[0].name
										, _s_name: ""
										, _s_pid: run._s_pid
										, _s_host: run._s_host
										, _i_cnt: item[1][0]
										, _f_val: item[1][1]
										, _f_own: item[1][2]
										, _f_min: item[1][3]
										, _f_max: item[1][4]
										, _f_sqr: item[1][5]
									})
									ctx.api.validate.check("metrics",te, safe.sure(nrNonFatal, function () {
										metrics.insert(te, nrNonFatal)
									}))
								}
								// grab transaction segments stats
								var scope = item[0]["scope"];
								if (!scope) return;

								var trnScope = nrParseTransactionName(scope)
								var trnName = nrParseTransactionName(item[0]["name"])

								if( !action_stats[scope] ) {
									action_stats[scope] = {
										"_idp": run._idp
										, "_s_name": trnScope.name
										, "_s_cat": trnScope.type.split("/", 2)[0]
										, "_s_type": trnScope.type.split("/", 2)[1]
										, "_dt": _dt
										, "_dts": _dts
										, "_dte": _dte
										, data: []
									}
								}
								action_stats[scope].data.push( {
									_s_name: trnName.name,
									_s_cat: trnName.type.split("/", 2)[0],
									_s_type: trnName.type.split("/", 2)[1],
									_i_cnt: item[1][0],
									_i_tt: Math.round(item[1][1]*1000),
									_i_own: Math.round(item[1][2]*1000),
									_i_min: Math.round(item[1][3]*1000),
									_i_max: Math.round(item[1][4]*1000),
									_i_sqr: Math.round(item[1][5]*1000)
								})
							})
							if (_.size(action_stats)) {
								_.forEach(_.values(action_stats), function(v) {
									ctx.api.validate.check("action-stats",v, safe.sure(nrNonFatal, function () {
										as.insert(v, nrNonFatal)
									}))
								})
							}
							res.json( { return_value: "ok" } );
						},
						analytic_event_data:function () {
							var body = nrParseBody(req);
							var run = prefixify(JSON.parse(new Buffer(req.query.run_id, 'base64').toString('utf8')));

							_.each(body[body.length - 1], function (item) {
								item = item[0];
								var trnName = nrParseTransactionName(item["name"]);
								var ct = trnName.type.split("/",2)
								var te = {
									"_idp": run._idp
									, "_s_name": trnName.name
									, "_s_cat": ct[0]
									, "_s_type": ct[1]
									, "_dt": new Date(item["timestamp"] )
									, "_i_wt": Math.round(item["webDuration"]*1000)
									, "_i_tt": Math.round(item["duration"]*1000)
								}
								ctx.api.validate.check("actions",te, safe.sure(nrNonFatal, function () {
									actions.insert(te, nrNonFatal);
								}))
							})
							res.json( { return_value: "ok" } );
						},
						error_data:function () {
							var body = nrParseBody(req);
							var run = prefixify(JSON.parse(new Buffer(req.query.run_id, 'base64').toString('utf8')));

							_.each(body[body.length - 1], function (ne) {
								var trnName = nrParseTransactionName(ne[1]);
								var te = {
									_idp:run._idp,
									_dt: new Date(),
									_s_reporter: "newrelic",
									_s_server: run._s_host,
									_s_logger: run._s_logger,
									_s_message: ne[2],
									_s_culprit: ne[1],
									exception: {
										_s_type: ne[3],
										_s_value: ne[2]
									},
									action: {
										_s_name: trnName.name,
										_s_cat: trnName.type.split("/",2)[0],
										_s_type: trnName.type.split("/",2)[1]
									},
									stacktrace: { frames: [] }
								}
								if( run._s_logger == "node" || run._s_logger == "nodejs" ) {
									nrParseStackTrace_nodejs( ne[4]["stack_trace"], te );
								} else if( run._s_logger == "dotnet" ) {
									nrParseStackTrace_dotnet( ne[4]["stack_trace"], te );
								}
								ctx.api.validate.check("error",te, safe.sure(function () {
										console.log(JSON.stringify(te), ne[4]["stack_trace"]);
										nrNonFatal.apply(this,arguments)
									}, function () {
									safe.parallel([
										function(cb) {
											// save actual error
											var md5sum = crypto.createHash('md5')
											md5sum.update(te.exception._s_type)
											md5sum.update(te._s_message + te.stacktrace.frames.length)
											te.ehash = md5sum.digest('hex')
											action_errors.find({ehash: te.ehash}).sort({_dt: -1}).limit(1).toArray(safe.sure(cb,function(edtl){
												if (edtl.length)
													te._dtl = edtl[0]._dtl
												else
													te._dtl = new Date();

												action_errors.insert(te, cb)
											}))
										},
										function(cb) {
											// modify error counter for
											// closest action
											actions.findAndModify(
												{_dt: {$gte: te._dt}},
												{_dt:-1},{$inc: {_i_err: 1}}
											,cb)
										}
									],nrNonFatal)
								}))
							})

							res.json( { return_value: "ok" } );
						},
						transaction_sample_data:function () {
							// ???? transaction trace, not suppored now
							res.json( { return_value: "ok" } );
						},
						get_agent_commands:function () {
							// .net agent send this request
							res.json( { return_value: [] } );
						},
						shutdown:function () {
							// .net agent send this request when IIS is stopped or there are no
							// request to .net applications long time
							res.json( { return_value: null } );
						}
					}
					var fn = nrpc[req.query.method];
					if (!fn)
						throw new Error("NewRelic: unknown method " + req.query.method)
					fn();
				}, function (err) {
					nrNonFatal(err)
					res.json({exception:{message:err.message}});
				})
			})
			ctx.router.get("/ajax/:project", function (req, res, next) {
				var data = req.query;
				safe.run(function (cb) {
					data._idp = new mongo.ObjectID(req.params.project);
					data._dtr = new Date();
					data._dt = data._dtr;

					var ip = req.headers['x-forwarded-for'] ||
						req.connection.remoteAddress ||
						req.socket.remoteAddress ||
						req.connection.socket.remoteAddress;

					data = prefixify(data,{strict:1});

					// add few data consistance checks
					if (data._i_tt > 1000 * 60 * 10)
						return cb(new Error("Ajax total time is too big > 10 min"))

					if (Math.abs(data._i_tt - data._i_pt - data._i_nt)>1000)
						return cb(new Error("ajax total time do not match components"))

					var md5sum = crypto.createHash('md5');
					md5sum.update(ip);
					md5sum.update(req.headers['host']);
					md5sum.update(req.headers['user-agent']);
					md5sum.update(""+parseInt((data._dtp.valueOf()/(1000*60*60))))
					data.shash = md5sum.digest('hex');
					md5sum = crypto.createHash('md5');
					md5sum.update(ip);
					md5sum.update(req.headers['host']);
					md5sum.update(req.headers['user-agent']);
					md5sum.update(data._dtp.toString());
					data.chash = md5sum.digest('hex');
					data._s_name = data.r
					data._s_url = data.url
					delete data.url
					delete data.r

					pages.findOne({
						chash: data.chash,
						_dt: {$lte: data._dt}
					}, {sort:{_dt: -1}, hint:{chash:1}}, safe.sure(cb, function (page) {
						if (page) {
							data._idpv = page._id;
							(page._s_route) && (data._s_route = page._s_route);
							(page._s_uri) && (data._s_uri = page._s_uri);
						}
						ctx.api.validate.check("ajax", data, safe.sure(cb, function(){
							safe.parallel([
								function (cb) {
									ajax.insert(data, cb)
								},
								function (cb) {
									if (!page) return cb();
									pages.update({_id:page._id}, {$inc:{_i_err: (data._i_code == 200)?0:1}}, cb)
								}
							],cb)
						}))
					}))
				}, function (err) {
					if (err) {
						console.log("BAD ajax: " + JSON.stringify(data));
						newrelic.noticeError(err);
					}
					res.set('Content-Type', 'image/gif');
					res.send(buf);
				})
			})
			ctx.router.get("/browser/:project",function (req, res, next) {
				var data = req.query;
				safe.run(function (cb) {
					data._idp=req.params.project;
					data._dtr = new Date();
					data._dtc = data._dt;
					data._dt = data._dtr;
					data.agent = useragent.parse(req.headers['user-agent']).toJSON();
					var ip = req.headers['x-forwarded-for'] ||
						 req.connection.remoteAddress ||
						 req.socket.remoteAddress ||
						 req.connection.socket.remoteAddress;

					var geo = geoip.lookup(ip);
					if (geo)
						data.geo = JSON.parse(JSON.stringify(geo));

					data = prefixify(data,{strict:1});

					// add few data consistance checks
					if (data._i_tt > 1000 * 60 * 10)
						return cb(new Error("Page total time is too big > 10 min"))

					if (Math.abs(data._i_tt - data._i_nt - data._i_lt - data._i_dt)>1000)
						return cb(new Error("Page total time do not match components"))

					var md5sum = crypto.createHash('md5');
					md5sum.update(ip);
					md5sum.update(req.headers['host']);
					md5sum.update(req.headers['user-agent']);
					md5sum.update(""+parseInt((data._dtp.valueOf()/(1000*60*60))))
					data.shash = md5sum.digest('hex');
					md5sum = crypto.createHash('md5');
					md5sum.update(ip);
					md5sum.update(req.headers['host']);
					md5sum.update(req.headers['user-agent']);
					md5sum.update(data._dtp.toString());
					data.chash = md5sum.digest('hex');
					data._i_err = 0;
					data._s_uri = data.p
					data._s_route = data.r
					delete data.r
					delete data.p

					ctx.api.validate.check("page", data, safe.sure(cb, function(){
						pages.insert(data, safe.sure(cb, function (docs) {
							// once after inserting page we need to link
							// this page events that probably cread earlier
							var _id = docs[0]._id;
							safe.parallel([
								function(cb) {
									events.update({chash: data.chash, _dt:{$gte:(Date.now()-data._i_tt*2),$lte:data._dt}}, {
										$set: {
											_idpv: _id,
											request: {
												_s_route: data._s_route,
												_s_uri: data._s_uri
											}
										}
									}, {multi: true}, safe.sure(cb, function (updates) {
										if (updates)
											pages.update({_id: _id}, {$inc: {_i_err: updates}}, cb);
										else
											cb();
									}))
								},
								function(cb) {
									ajax.update({chash: data.chash, _dt:{$gte:(Date.now()-data._i_tt*2),$lte:data._dt}}, {
										$set: {
											_idpv: _id,
											_s_route: data._s_route,
											_s_uri: data._s_uri}
									}, {multi: true}, safe.sure(cb, function() {
										ajax.find({chash: data.chash, _i_code: {$ne: 200}}).count(safe.sure(cb, function(count) {
											if (count > 0)
												pages.update({_id: _id}, {$inc: {_i_err: count}}, cb);
											else
												cb();
										}))
									}))
								}
							], cb)
						}))
					}))
				}, function (err) {
					if (err) {
						newrelic.noticeError(err);
					}
					res.set('Content-Type', 'image/gif');
					res.send(buf);
				})
			})
			// dsn is like http://auth1:auth2@{host}/collect/sentry/{projectid}
			ctx.router.post( "/sentry/api/store", function( req, res, next ) {
				safe.run(function(cb) {
					var zip_buffer = new Buffer( req.body.toString(), 'base64' );
					zlib.inflate( zip_buffer, safe.sure( cb, function( _buffer_getsentry_data ) {
						var ge = JSON.parse( _buffer_getsentry_data.toString() );
						var te = {
							_idp:new mongo.ObjectID(ge.project),
							_dt: new Date(ge.timestamp),
							_s_reporter: "raven",
							_s_server: ge.server_name,
							_s_logger: ge.platform,
							_s_message: ge.message,
							_s_culprit: ge.culprit || 'undefined',
							exception: {
								_s_type: ge.exception[0].type,
								_s_value: ge.exception[0].value
							},
							stacktrace: { frames: [] }
						}

						if (ge.exception[0].stacktrace) {
							_.each(ge.exception[0].stacktrace.frames, function (frame) {
								te.stacktrace.frames.push({
									_s_file: frame["filename"] || "",
									_i_line: frame["lineno"] || 0,
									_i_col: 0,
									_s_func: frame["function"] || "",
									pre_context : frame["pre_context"] || [],
									_s_context : frame["context_line"] || "",
									post_context : frame["post_context"] || []
								})
							})
							te.stacktrace.frames = te.stacktrace.frames.reverse();
						}
						ctx.api.validate.check("error",te, safe.sure(cb, function () {
							safe.parallel([
								function() {
									var md5sum = crypto.createHash('md5')
									md5sum.update(te.exception._s_type)
									md5sum.update(te._s_message + te.stacktrace.frames.length)
									te.ehash = md5sum.digest('hex')
									action_errors.find({ehash: te.ehash}).sort({_dt: -1}).limit(1).toArray(safe.sure(cb,function(edtl){
										if (edtl.length)
											te._dtl = edtl[0]._dtl
										else
											te._dtl = new Date();

										action_errors.insert(te, cb)
									}))
								},
								function() {
									var q = {_dt: {$gte: te._dt}}
									actions.update(q,{$inc: {_i_err: 1}},{multi: false})
								}
							],cb)
						}))
					}));
				}, function( error ){
					if (error) {
						// report getsentry error with newrelic ;)
						newrelic.noticeError(error);
						res.writeHead( 500, { 'x-sentry-error': error.toString() } );
						res.status(500).end( error.toString() );
					} else {
						res.status(200).end( "ok" );
					}
				});
			})
			ctx.router.get("/sentry/api/:project/:action",function (req, res, next) {
				var data = {};
				var IfInsert = 0;
				safe.run(function (cb) {
					data = JSON.parse(req.query.sentry_data);
					var ip = req.headers['x-forwarded-for'] ||
						 req.connection.remoteAddress ||
						 req.socket.remoteAddress ||
						 req.connection.socket.remoteAddress;

					var _dtp = data._dtp || data._dtInit;
					data.project && (delete data.project);
					data._idp = req.params.project;
					data._dtr = new Date();
					data._dtc = data._dt;
					data._dt = data._dtr;
					data._dtp = _dtp;
					data._dtInit && (delete data._dtInit);
					data.agent = useragent.parse(req.headers['user-agent'],data.request.headers['User-Agent']).toJSON();
					data = prefixify(data,{strict:1});
					var md5sum = crypto.createHash('md5');
					md5sum.update(ip);
					md5sum.update(req.headers['host']);
					md5sum.update(req.headers['user-agent']);
					md5sum.update(""+(parseInt(data._dtp.valueOf()/(1000*60*60))))
					data.shash = md5sum.digest('hex');
					md5sum = crypto.createHash('md5');
					md5sum.update(ip);
					md5sum.update(req.headers['host']);
					md5sum.update(req.headers['user-agent']);
					md5sum.update(data._dtp.toString());
					data.chash = md5sum.digest('hex');
					// when error happens try to link it with current page
					// which is latest page from same client (chash)
					// which is registered not later than current event
					data._s_culprit = data.culprit || 'undefined'; delete data.culprit;
					data._s_message = data.message; delete data.message;
					delete data.event_id;
					data._s_logger = data.logger; delete data.logger;
					data._s_server = "rum";
					data._s_reporter = "raven";

					data.exception = data.exception || {};
					data.exception._s_type = data.exception.type || 'Error'; delete data.exception.type;
					data.exception._s_value = data.exception.value || data._s_message; delete data.exception.value;
					if (data.stacktrace) {
						_.forEach(data.stacktrace.frames, function(r) {
							r._s_file = r.filename; delete r.filename;
							r._i_line = r.lineno || 0; delete r.lineno;
							r._i_col = r.colno || 0; delete r.colno;
							r._s_func = r.function || 'undefined'; delete r.function;
							r.pre_context = [];
							r.post_context = [];
							r._s_context = r.context_line || ""; delete r.context_line;
							delete r.in_app;
						})
					} else
						data.stacktrace = {frames:[]};
					delete data.platform;
					if (data.request && data.request.url) {
						data.request._s_url=data.request.url;
						delete data.request.url;
					}

					pages.findAndModify({chash:data.chash, _dt:{$lte:data._dt}},{_dt:-1},{$inc:{_i_err:1}},{multi:false}, safe.sure(cb, function (page) {
						if (page) {
							data._idpv = page._id;
							(page._s_route) && (data.request._s_route = page._s_route);
							(page._s_uri) && (data.request._s_uri = page._s_uri);
						}
						ctx.api.validate.check("error",data, safe.sure(cb, function () {
							md5sum = crypto.createHash('md5')
							md5sum.update(data.exception._s_type)
							md5sum.update(data._s_message + data.stacktrace.frames.length)
							data.ehash = md5sum.digest('hex')
							//find().sort().limit(1).toArray
							events.find({ehash: data.ehash}).sort({_dt: -1}).limit(1).toArray(safe.sure(cb,function(edtl){
								if (edtl.length)
									data._dtl = edtl[0]._dtl
								else
									data._dtl = new Date();

									events.insert(data, safe.sure(cb, function(res){
										ctx.api.collect.getStackTraceContext("public",res[0].stacktrace.frames, function (err,frames) {
											events.update({"_id":res[0]._id},{$set : {stacktrace:{frames : frames}}},safe.sure(cb, function(res){
											}))
										})
										cb(null)
									}))
							}))
						}))
					}))
				}, function (err) {
					if (err) {
						newrelic.noticeError(err);
						console.log(data);
					}
					res.set('Content-Type', 'image/gif');
					res.send(buf);
				})
			})
		}))
	}),cb(null, {api:{
				getTraceLineContext:function (t, p, cb) {
					if (cache.has(p._s_file+"_"+p._i_line+"_"+p._i_col) == true) {
						block=cache.get(p._s_file+"_"+p._i_line+"_"+p._i_col);
					} else if (cache.has("Error_"+p._s_file+"_"+p._i_line+"_"+p._i_col) == true) {
						block=cache.get("Error_"+p._s_file+"_"+p._i_line+"_"+p._i_col);
					} else {
						var url = p._s_file.trim();

						request.get({url:url}, safe.sure(cb, function (res, body) {
							if (res.statusCode!=200)
								return cb(new Error("Error, status code " + res.statusCode));
							var lineno=0,lineidx=0;
							while (lineno<parseInt(p._i_line)-1) {
								lineidx = body.indexOf('\n',lineidx?(lineidx+1):0);
								if (lineidx==-1)
									return cb(new Error("Line number '"+p._i_line+"' is not found"));
								lineno++;
							}
							var idx = lineidx+parseInt(p._i_col);
							body = body.substring(0,idx)+"_t__pos____"+body.substring(idx);
							if (idx>=body.length)
								return cb(new Error("Column number '"+p._i_col+"' is not found"));
							var block = body.substring(Math.max(idx-80,0),Math.min(idx+80,body.length-1));
							cache.set(p._s_file+"_"+p._i_line+"_"+p._i_col,block)
						}));
					}
					return cb(null, block);
                },
                getStackTraceContext:function (t, frames, cb) {
						safe.eachSeries(frames, function(r, cb) {
								ctx.api.collect.getTraceLineContext("public",r, function (err,context) {
									if (err) {
										console.log('ERR_inFetchStack',err)
										cache.set("Error_"+r._s_file+"_"+r._i_line+"_"+r._i_col,err)
										r._s_context=err;
									} else {
										r._s_context=context;
									}
									cb(null, r)
								})
						}, safe.sure(cb, function(){
							cb(null, frames)
						}))
                }
		}}))
}
