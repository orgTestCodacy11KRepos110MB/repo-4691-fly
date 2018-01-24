const logger = require('./logger')
const { EventEmitter2 } = require('eventemitter2')

/**
 * The fetch event fires when your app receives an HTTP request
 * @event #fetch
 * @type {FetchEvent}
 * @property {FetchEvent} event
 */

/**
 * @class
 */
class FetchEvent {
	constructor(type, init, callback) {
		this.type = type
		this.request = init.request
		if (!this.request)
			throw new Error("init.request is required.")
		this.callback = callback
	}

	/** 
	 * respondWith callback
	 * @callback respondWithCallback
	 * @param {Response} The HTTP response to reply with
	 */
	/**
	 * Registers a function to generate a response for this event
	 * @param {respondWithCallback} fn
	 */
	respondWith(fn) {
		try {
			if (typeof fn === "function") {
				let ret = fn.call(null)
				if (ret instanceof Promise) {
					ret.then(res => {
						this.callback(null, res)
					}).catch(err => {
						this.callback(err)
					})
				} else if (ret instanceof Response) {
					this.callback(null, ret)
				}
			} else if (fn instanceof Response) {
				this.callback(null, fn)
			}
		} catch (err) {
			this.callback(err)
		}
	}
}

exports.FetchEvent = FetchEvent

const emitter = new EventEmitter2()

exports.addEventListener = function (name, fn) {
	emitter.addListener(name, fn)
}

exports.fireEventInit = function (ivm) {
	return function fireEvent(name, ...args) {
		args.unshift(ivm)
		try {
			switch (name) {
				case "fetch":
					fireFetchEvent.apply(undefined, args)
					break
				case "fetchEnd":
					fireFetchEndEvent.apply(undefined, args)
					break
				default:
					throw new Error(`unknown event listener: ${name}`)
			}
		} catch (err) {
			logger.debug(err.message, err.stack)
			let cb = args[args.length - 1] // should be the last arg
			if (cb instanceof ivm.Reference)
				cb.apply(undefined, [err.toString()])
		}
	}
}

function fireFetchEvent(ivm, url, nodeReq, reqProxy, nodeBody, callback) {
	logger.debug("handling request event")
	nodeReq.body = nodeBody
	let req = new Request(url, nodeReq, reqProxy)
	let fetchEvent = new FetchEvent('fetch', { request: req }, async function (err, res) {
		logger.debug("request event callback called", typeof err, typeof res, res instanceof Response)
		callback.apply(undefined, [
			err && err.toString() || null,
			new ivm.ExternalCopy({
				headers: res.headers,
				status: res.status,
				bodyUsed: res.bodyUsed,
			})
				.copyInto(),
			!res._proxy ?
				new ivm.ExternalCopy(await res.arrayBuffer())
					.copyInto() :
				null,
			res._proxy // pass back the proxy
		])
	})
	emitter.emit('fetch', fetchEvent)
}

function fireFetchEndEvent(ivm, url, nodeReq, nodeRes, err, done) {
	const listeners = emitter.listeners('fetchEnd')
	if (listeners.length === 0)
		return done.apply()
	const req = new Request(url, nodeReq)
	const res = new Response("", nodeRes)

	let event = {
		request: req,
		response: res,
		error: err
	}

	emitter.emitAsync('fetchEnd', event).then(() => {
		done.apply()
	})
}

class LogMessage {
	constructor(level, message, timestamp = new Date) {
		this.level = level
		this.message = message
		this.timestamp = timestamp
	}
}

class LogEvent {
	constructor(type = "log", init = {}) {
		this.type = type
		this.log = new LogMessage(init.level, init.message, init.timestamp || new Date)
	}
}

exports.LogEvent = LogEvent

exports.dispatchEvent = function dispatchEvent(event) {
	emitter.emit(event.type, event)
}