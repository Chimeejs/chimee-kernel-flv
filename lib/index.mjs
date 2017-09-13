import _Object$getOwnPropertyDescriptor from 'babel-runtime/core-js/object/get-own-property-descriptor';
import _Object$getPrototypeOf from 'babel-runtime/core-js/object/get-prototype-of';
import _classCallCheck from 'babel-runtime/helpers/classCallCheck';
import _possibleConstructorReturn from 'babel-runtime/helpers/possibleConstructorReturn';
import _createClass from 'babel-runtime/helpers/createClass';
import _inherits from 'babel-runtime/helpers/inherits';
import { CustEvent, Log, UAParser, deepAssign, throttle } from 'chimee-helper';
import _Object$assign from 'babel-runtime/core-js/object/assign';
import _get from 'babel-runtime/helpers/get';
import work from 'webworkify';
import _typeof from 'babel-runtime/helpers/typeof';

var MSEController = function (_CustEvent) {
  _inherits(MSEController, _CustEvent);

  /**
   * mediasource 控制层
   * @class mediasource
   * @param {Element} videoElement
   * @param {object} config
   */
  function MSEController(videoElement, config) {
    _classCallCheck(this, MSEController);

    var _this = _possibleConstructorReturn(this, (MSEController.__proto__ || _Object$getPrototypeOf(MSEController)).call(this));

    _this.video = videoElement;
    _this.config = config;
    _this.tag = 'mse-controller';
    _this.e = {
      onSourceOpen: _this.onSourceOpen.bind(_this),
      onSourceEnded: _this.onSourceEnded.bind(_this),
      onSourceClose: _this.onSourceClose.bind(_this),
      onSourceBufferError: _this.onSourceBufferError.bind(_this)
    };
    _this.queue = [];
    _this.removeRangesList = [];
    _this.removeBucketing = false;
    _this.timer = null;
    // this.mimeCodec = 'video/mp4; codecs="avc1.640020,mp4a.40.2"';
    //this.init();
    return _this;
  }

  /**
   * 初始化 控制层
   */


  _createClass(MSEController, [{
    key: 'init',
    value: function init(mediaInfo) {
      if (this.mediaSource) {
        Log.Error(this.tag, 'MediaSource has been attached to an HTMLMediaElement!');
        throw new Error('MediaSource has been attached to an HTMLMediaElement!');
      }
      mediaInfo.data.videoCodec || (mediaInfo.data.videoCodec = 'avc1.640020');
      mediaInfo.data.audioCodec || (mediaInfo.data.audioCodec = 'mp4a.40.2');

      this.mimeCodec = 'video/mp4; codecs="' + mediaInfo.data.videoCodec + ',' + mediaInfo.data.audioCodec + '"';

      var ms = this.mediaSource = new window.MediaSource();
      ms.addEventListener('sourceopen', this.e.onSourceOpen);
      ms.addEventListener('sourceended', this.e.onSourceEnded);
      ms.addEventListener('sourceclose', this.e.onSourceClose);
      // this.sourceBuffer.updating = true;
      this.sourceBufferEvent();
    }

    /**
     * mediaSource open
     */

  }, {
    key: 'onSourceOpen',
    value: function onSourceOpen() {
      var _this2 = this;

      Log.verbose(this.tag, 'MediaSource onSourceOpen');
      this.mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);

      this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeCodec);
      this.sourceBuffer.addEventListener('error', this.e.onSourceBufferError);
      this.sourceBuffer.addEventListener('abort', function () {
        return Log.verbose(_this2.tag, 'sourceBuffer: abort');
      });
      this.sourceBuffer.addEventListener('updateend', function () {
        if (_this2.queue.length > 0) {
          if (!_this2.sourceBuffer.updating) {
            if (_this2.needCleanupSourceBuffer()) {
              _this2.doCleanupSourceBuffer();
            } else {
              var data = _this2.queue.shift();
              _this2.appendBuffer(data);
            }
          }
        }
        _this2.emit('updateend');
      });
      this.doUpdate();
      this.emit('source_open');
      // this.sourceBuffer.updating = false;
    }
  }, {
    key: 'doUpdate',
    value: function doUpdate() {
      var _this3 = this;

      clearTimeout(this.timer);
      if (this.queue.length > 0) {
        var data = this.queue.shift();
        this.appendBuffer(data);
      } else {
        this.timer = setTimeout(function () {
          _this3.doUpdate();
        }, 100);
      }
    }

    /**
     * sourceBuffer 事件
     */

  }, {
    key: 'sourceBufferEvent',
    value: function sourceBufferEvent() {
      var _this4 = this;

      this.on('mediaSegment', function (handler) {
        var data = handler.data;
        if (!_this4.sourceBuffer || _this4.sourceBuffer.updating || _this4.queue.length > 0) {
          _this4.queue.push(data);
        } else {
          _this4.appendBuffer(data);
        }
      });

      this.on('mediaSegmentInit', function (handler) {
        var data = handler.data;
        if (!_this4.sourceBuffer || _this4.sourceBuffer.updating || _this4.queue.length > 0) {
          _this4.queue.push(data);
        } else {
          _this4.appendBuffer(data);
        }
      });
    }

    /**
     * 是否需要清除sourcebuffer 里的buffer
     */

  }, {
    key: 'needCleanupSourceBuffer',
    value: function needCleanupSourceBuffer() {
      var currentTime = this.video.currentTime;

      var sb = this.sourceBuffer;
      var buffered = sb.buffered;

      if (buffered.length >= 1) {
        if (currentTime - buffered.start(0) >= this.config.autoCleanupMaxBackwardDuration) {
          return true;
        }
      }
      return false;
    }

    /**
     * 清除buffer
     */

  }, {
    key: 'doCleanupSourceBuffer',
    value: function doCleanupSourceBuffer() {
      Log.verbose(this.tag, 'docleanBuffer');
      var currentTime = this.video.currentTime;
      var sb = this.sourceBuffer;
      var buffered = sb.buffered;
      var doRemove = false;
      for (var i = 0; i < buffered.length; i++) {
        var start = buffered.start(i);
        var end = buffered.end(i);

        if (start <= currentTime && currentTime < end + 3) {
          if (currentTime - start >= this.config.autoCleanupMaxBackwardDuration) {
            doRemove = true;
            var removeEnd = currentTime - this.config.autoCleanupMinBackwardDuration;
            this.removeRangesList.push({ start: start, end: removeEnd });
          }
        } else if (end < currentTime) {
          doRemove = true;
          this.removeRangesList.push({ start: start, end: end });
        }
      }
      if (doRemove && !this.sourceBuffer.updating) {
        this.cleanRangesList();
      }
    }

    /**
     * 清除bufferlist
     */

  }, {
    key: 'cleanRangesList',
    value: function cleanRangesList() {
      if (this.sourceBuffer.updating) {
        return;
      }
      var sb = this.sourceBuffer;
      while (this.removeRangesList.length && !sb.updating) {
        var ranges = this.removeRangesList.shift();
        sb.remove(ranges.start, ranges.end);
      }
    }

    /**
     * 往sourcebuffer里添加数据
     */

  }, {
    key: 'appendBuffer',
    value: function appendBuffer(data) {
      try {
        this.sourceBuffer.appendBuffer(data);
      } catch (e) {
        if (e.code === 22) {
          // chrome 大概会有350M
          Log.verbose(this.tag, 'MediaSource bufferFull');
          this.emit('bufferFull');
        }
      }
    }

    /**
     * sourcebuffer 结束
     */

  }, {
    key: 'onSourceEnded',
    value: function onSourceEnded() {
      Log.verbose(this.tag, 'MediaSource onSourceEnded');
    }

    /**
     * sourcebuffer 关闭
     */

  }, {
    key: 'onSourceClose',
    value: function onSourceClose() {
      Log.verbose(this.tag, 'MediaSource onSourceClose');
      if (this.mediaSource && this.e !== null) {
        this.mediaSource.removeEventListener('sourceopen', this.e.onSourceOpen);
        this.mediaSource.removeEventListener('sourceended', this.e.onSourceEnded);
        this.mediaSource.removeEventListener('sourceclose', this.e.onSourceClose);
      }
    }

    /**
    * sourcebuffer 错误
    */

  }, {
    key: 'onSourceBufferError',
    value: function onSourceBufferError(e) {
      Log.info(e);
      Log.error(this.tag, 'SourceBuffer Error: ' + e);
    }

    /**
     * seek
     */

  }, {
    key: 'seek',
    value: function seek() {}

    /**
     * 销毁
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this.mediaSource) {
        var ms = this.mediaSource;
        // pending segments should be discard
        this.queue = [];
        // remove all sourcebuffers
        var sb = this.sourceBuffer;
        if (sb) {
          if (ms.readyState !== 'closed') {
            ms.removeSourceBuffer(sb);
            sb.removeEventListener('error', this.e.onSourceBufferError);
            sb.removeEventListener('updateend', this.e.onSourceBufferUpdateEnd);
          }
          this.sourceBuffer = null;
        }
        if (ms.readyState === 'open') {
          try {
            ms.endOfStream();
          } catch (error) {
            Log.e(this.tag, error.message);
          }
        }
        ms.removeEventListener('sourceopen', this.e.onSourceOpen);
        ms.removeEventListener('sourceended', this.e.onSourceEnded);
        ms.removeEventListener('sourceclose', this.e.onSourceClose);
        this.mediaSource = null;
      }

      if (this._mediaElement) {
        this._mediaElement.src = '';
        this._mediaElement.removeAttribute('src');
        this._mediaElement = null;
      }
      if (this._mediaSourceObjectURL) {
        window.URL.revokeObjectURL(this._mediaSourceObjectURL);
        this._mediaSourceObjectURL = null;
      }
    }
  }]);

  return MSEController;
}(CustEvent);

/**
* 处理range的静态函数
* author songguangyu
* emil 522963130@qq.com
*/
var handleRange = function (range) {
  var headers = {};
  var param = void 0;

  if (range.to !== -1) {
    param = 'bytes=' + range.from.toString() + '-' + range.to.toString();
  } else {
    param = 'bytes=' + range.from.toString() + '-';
  }
  headers['Range'] = param;

  return {
    headers: headers
  };
};

/**
* fetch firfox 直播 点播
* author songguangyu
* emil 522963130@qq.com
*/
/**
 * FetchLoader
 * @class FetchLoader
 * @param {string} video url
 * @param  {object} range.from range.to
 */

var FetchLoader = function (_CustEvent) {
	_inherits(FetchLoader, _CustEvent);

	_createClass(FetchLoader, null, [{
		key: 'isSupport',


		/**
    * broswer is support moz-chunk
    */
		value: function isSupport() {
			if (window.fetch && window.ReadableStream) {
				return true;
			} else {
				return false;
			}
		}
	}]);

	function FetchLoader(src, config) {
		_classCallCheck(this, FetchLoader);

		var _this = _possibleConstructorReturn(this, (FetchLoader.__proto__ || _Object$getPrototypeOf(FetchLoader)).call(this));

		_this.tag = 'fetch';
		_this.fetching = false;
		_this.config = config;
		_this.range = {
			from: 0,
			to: 500000
		};
		_this.src = src;
		_this.totalRange = null;
		_this.block = 500000;
		_this.reader = null;
		_this.requestAbort = false;
		_this.arrivalDataCallback = null;
		_this.bytesStart = 0;
		return _this;
	}
	/**
   * if don't need range don't set
   * @param  {object} range.from range.to
   */


	_createClass(FetchLoader, [{
		key: 'open',
		value: function open(range, keyframePoint) {
			var _this2 = this;

			this.requestAbort = false;
			var reqHeaders = new Headers();
			var r = range || { from: 0, to: -1 };
			if (!this.config.isLive) {
				this.range.from = r.from;
				this.range.to = r.to;
				var headers = handleRange(r).headers;
				for (var i in headers) {
					reqHeaders.append(i, headers[i]);
				}
			}
			if (keyframePoint) {
				this.bytesStart = 0;
			}
			this.req = new Request(this.src, { headers: reqHeaders });

			fetch(this.req).then(function (res) {
				if (res.ok) {
					var reader = res.body.getReader();
					return _this2.pump(reader, keyframePoint);
				}
			});
		}

		/**
    * pause video
    */

	}, {
		key: 'pause',
		value: function pause() {
			this.requestAbort = true;
		}

		/**
    * pump data
    */

	}, {
		key: 'pump',
		value: function pump(reader, keyframePoint) {
			var _this3 = this;

			// ReadableStreamReader
			return reader.read().then(function (result) {
				if (result.done) {
					Log.verbose(_this3.tag, 'play end');
					// trigger complete
				} else {
					if (_this3.requestAbort === true) {
						return reader.cancel();
					}
					var chunk = result.value.buffer;

					if (_this3.arrivalDataCallback) {
						_this3.arrivalDataCallback(chunk, _this3.bytesStart, keyframePoint);
						_this3.bytesStart += chunk.byteLength;
					}
					return _this3.pump(reader);
				}
			});
		}
	}]);

	return FetchLoader;
}(CustEvent);

/**
* XHR 点播
* author songguangyu
* emil 522963130@qq.com
*/
// import Log from 'helper/log';
/**
 * MozChunkLoader
 * @class MozChunkLoader
 * @param {string} video url
 * @param  {object} range.from range.to
 */

var RangeLoader = function (_CustEvent) {
  _inherits(RangeLoader, _CustEvent);

  _createClass(RangeLoader, null, [{
    key: 'isSupport',


    /**
    * broswer is support XMLHttpRequest
    */
    value: function isSupport() {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://example.com', true);
        xhr.responseType = 'arraybuffer';
        return xhr.responseType === 'arraybuffer';
      } catch (e) {
        return false;
      }
    }
  }]);

  function RangeLoader(src, config) {
    _classCallCheck(this, RangeLoader);

    var _this = _possibleConstructorReturn(this, (RangeLoader.__proto__ || _Object$getPrototypeOf(RangeLoader)).call(this));

    _this.tag = 'RangeLoader';
    _this.xhr = null;
    _this.src = src;
    _this.totalLength = null;
    _this.chunkSizeKB = 393216;
    _this.range = {};
    _this.bytesStart = 0;
    return _this;
  }
  /**
   * if don't need range don't set
   * @param  {object} range.from range.to
   */


  _createClass(RangeLoader, [{
    key: 'open',
    value: function open(range) {
      var xhr = this.xhr = new XMLHttpRequest();
      xhr.open('GET', this.src, true);
      xhr.responseType = 'arraybuffer';
      xhr.onreadystatechange = this.onReadyStateChange.bind(this);
      xhr.onprogress = this.onProgress.bind(this);
      xhr.onload = this.onLoad.bind(this);
      xhr.onerror = this.onXhrError.bind(this);
      var r = range || { from: 0, to: -1 };
      this.range.from = r.from;
      this.range.to = r.to;
      var headers = handleRange(r).headers;
      for (var i in headers) {
        xhr.setRequestHeader(i, headers[i]);
      }
      xhr.send();
    }

    /**
     * abort request
     */

  }, {
    key: 'abort',
    value: function abort() {
      this.xhr.onreadystatechange = null;
      this.xhr.onprogress = null;
      this.xhr.onload = null;
      this.xhr.onerror = null;
      this.xhr.abort();
      this.xhr = null;
    }

    /**
     * destroy xhr Object clean cache
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this.xhr) {
        this.abort();
        this.xhr.onreadystatechange = null;
        this.xhr.onprogress = null;
        this.xhr.onload = null;
        this.xhr.onerror = null;
        this.xhr = null;
      }
      this.totalLength = null;
      this.bytesStart = null;
      this.range = {};
    }

    /**
     * xhr onReadyStateChange
     */

  }, {
    key: 'onReadyStateChange',
    value: function onReadyStateChange(e) {
      var xhr = this.xhr;
      if (xhr.readyState === 2) {
        if (xhr.status < 200 && xhr.status > 299) {
          var info = {
            from: this.range.from,
            to: this.range.to,
            url: this.src,
            msg: 'http Error: http code ' + xhr.status
          };
          this.emit(this.tag, info);
        }
      }
    }

    /**
     * xhr onProgress
     */

  }, {
    key: 'onProgress',
    value: function onProgress(e) {
      if (!this.totalLength) {
        this.totalLength = e.total;
        this.abort();
        this.open({ from: 0, to: this.chunkSizeKB });
      }
    }

    /**
     * xhr onLoad
     */

  }, {
    key: 'onLoad',
    value: function onLoad(e) {
      if (!this.totalLength) {
        return;
      }
      if (this.range.to < this.totalLength) {
        // this.open({from: this.range.to + 1, to: this.range.to + 1 + this.chunkSizeKB});
      }

      if (this.arrivalDataCallback) {
        var chunk = e.target.response;
        this.arrivalDataCallback(chunk, this.bytesStart);
        this.bytesStart += chunk.byteLength;
      }
    }

    /**
     * xhr onXhrError
     */

  }, {
    key: 'onXhrError',
    value: function onXhrError(e) {
      var info = {
        from: this.range.from,
        to: this.range.to,
        url: this.src,
        msg: e.constructor.name + ' ' + e.type
      };
      this.emit(this.tag, info);
    }
  }]);

  return RangeLoader;
}(CustEvent);

var WebSocketLoader = function (_CustEvent) {
    _inherits(WebSocketLoader, _CustEvent);

    _createClass(WebSocketLoader, null, [{
        key: 'isSupported',
        value: function isSupported() {
            try {
                return typeof window.WebSocket !== 'undefined';
            } catch (e) {
                return false;
            }
        }
    }]);

    function WebSocketLoader(src, config) {
        _classCallCheck(this, WebSocketLoader);

        var _this = _possibleConstructorReturn(this, (WebSocketLoader.__proto__ || _Object$getPrototypeOf(WebSocketLoader)).call(this));

        _this.tag = 'WebSocketLoader';
        _this.range = {
            from: 0,
            to: 500000
        };
        _this.src = src;
        _this._ws = null;
        _this._requestAbort = false;
        _this._receivedLength = 0;
        return _this;
    }

    _createClass(WebSocketLoader, [{
        key: 'destroy',
        value: function destroy() {
            if (this._ws) {
                this.abort();
            }
            _get(WebSocketLoader.prototype.__proto__ || _Object$getPrototypeOf(WebSocketLoader.prototype), 'destroy', this).call(this);
        }
    }, {
        key: 'open',
        value: function open(range, keyframePoint) {
            try {
                var ws = this._ws = new self.WebSocket(this.src);
                ws.binaryType = 'arraybuffer';
                ws.onopen = this._onWebSocketOpen.bind(this);
                ws.onclose = this._onWebSocketClose.bind(this);
                ws.onmessage = this._onWebSocketMessage.bind(this);
                ws.onerror = this._onWebSocketError.bind(this);
            } catch (e) {
                var info = { code: e.code, msg: e.message };

                if (this._onError) {
                    this._onError(LoaderErrors.EXCEPTION, info);
                } else {
                    throw new RuntimeException(info.msg);
                }
            }
        }
    }, {
        key: 'abort',
        value: function abort() {
            var ws = this._ws;
            if (ws && (ws.readyState === 0 || ws.readyState === 1)) {
                // CONNECTING || OPEN
                this._requestAbort = true;
                ws.close();
            }

            this._ws = null;
        }
    }, {
        key: '_onWebSocketOpen',
        value: function _onWebSocketOpen(e) {}
    }, {
        key: '_onWebSocketClose',
        value: function _onWebSocketClose(e) {
            if (this._requestAbort === true) {
                this._requestAbort = false;
                return;
            }

            if (this._onComplete) {
                this._onComplete(0, this._receivedLength - 1);
            }
        }
    }, {
        key: '_onWebSocketMessage',
        value: function _onWebSocketMessage(e) {
            var _this2 = this;

            if (e.data instanceof ArrayBuffer) {
                this._dispatchArrayBuffer(e.data);
            } else if (e.data instanceof Blob) {
                var reader = new FileReader();
                reader.onload = function () {
                    _this2._dispatchArrayBuffer(reader.result);
                };
                reader.readAsArrayBuffer(e.data);
            } else {
                var info = { code: -1, msg: 'Unsupported WebSocket message type: ' + e.data.constructor.name };

                if (this._onError) {
                    this._onError(LoaderErrors.EXCEPTION, info);
                } else {
                    throw new RuntimeException(info.msg);
                }
            }
        }
    }, {
        key: '_dispatchArrayBuffer',
        value: function _dispatchArrayBuffer(arraybuffer) {
            var chunk = arraybuffer;
            var byteStart = this._receivedLength;
            this._receivedLength += chunk.byteLength;

            if (this.arrivalDataCallback) {
                this.arrivalDataCallback(chunk, byteStart, this._receivedLength);
            }
        }
    }, {
        key: '_onWebSocketError',
        value: function _onWebSocketError(e) {
            var info = {
                code: e.code,
                msg: e.message
            };

            if (this._onError) {
                this._onError(LoaderErrors.EXCEPTION, info);
            } else {
                throw new RuntimeException(info.msg);
            }
        }
    }]);

    return WebSocketLoader;
}(CustEvent);

/**
* XHR firfox 直播 点播
* author songguangyu
* emil 522963130@qq.com
*/
// import Log from 'helper/log';
/**
 * MozChunkLoader
 * @class MozChunkLoader
 * @param {string} video url
 * @param  {object} range.from range.to
 */

var MozChunkLoader = function (_CustEvent) {
  _inherits(MozChunkLoader, _CustEvent);

  _createClass(MozChunkLoader, null, [{
    key: 'isSupport',


    /**
     * broswer is support moz-chunk
     */
    value: function isSupport() {
      try {
        var xhr = new XMLHttpRequest();
        // Firefox 37- requires .open() to be called before setting responseType
        xhr.open('GET', 'https://example.com', true);
        xhr.responseType = 'moz-chunked-arraybuffer';
        return xhr.responseType === 'moz-chunked-arraybuffer';
      } catch (e) {
        return false;
      }
    }
  }]);

  function MozChunkLoader(src, config) {
    _classCallCheck(this, MozChunkLoader);

    var _this = _possibleConstructorReturn(this, (MozChunkLoader.__proto__ || _Object$getPrototypeOf(MozChunkLoader)).call(this));

    _this.tag = 'mozChunkLoader';
    _this.xhr = null;
    _this.src = src;
    _this.config = config;
    _this.totalLength = null;
    _this.chunkSizeKB = 393216;
    _this.range = {};
    _this.bytesStart = 0;
    return _this;
  }
  /**
   * if don't need range don't set
   * @param  {object} range.from range.to
   */


  _createClass(MozChunkLoader, [{
    key: 'open',
    value: function open(range) {
      var xhr = this.xhr = new XMLHttpRequest();
      xhr.open('GET', this.src, true);
      xhr.responseType = 'moz-chunked-arraybuffer';
      xhr.onreadystatechange = this.onReadyStateChange.bind(this);
      xhr.onprogress = this.onProgress.bind(this);
      xhr.onload = this.onLoadEnd.bind(this);
      xhr.onerror = this.onXhrError.bind(this);
      if (!this.config.isLive) {
        var r = range || { from: 0, to: -1 };
        this.range.from = r.from;
        this.range.to = r.to;
        var headers = handleRange(r).headers;
        for (var i in headers) {
          xhr.setRequestHeader(i, headers[i]);
        }
      }
      xhr.send();
    }

    /**
     * abort request
     */

  }, {
    key: 'abort',
    value: function abort() {
      this.xhr.onreadystatechange = null;
      this.xhr.onprogress = null;
      this.xhr.onload = null;
      this.xhr.onerror = null;
      this.xhr.abort();
      this.xhr = null;
    }

    /**
     * destroy xhr Object clean cache
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this.xhr) {
        this.abort();
        this.xhr.onreadystatechange = null;
        this.xhr.onprogress = null;
        this.xhr.onload = null;
        this.xhr.onerror = null;
        this.xhr = null;
      }
      this.totalLength = null;
      this.bytesStart = null;
      this.range = {};
    }

    /**
     * xhr onReadyStateChange
     */

  }, {
    key: 'onReadyStateChange',
    value: function onReadyStateChange(e) {
      var xhr = this.xhr;
      if (xhr.readyState === 2) {
        if (xhr.status < 200 && xhr.status > 299) {
          var info = {
            from: this.range.from,
            to: this.range.to,
            url: this.src,
            msg: 'http Error: http code ' + xhr.status
          };
          this.emit(this.tag, info);
        }
      }
    }

    /**
     * xhr onProgress
     */

  }, {
    key: 'onProgress',
    value: function onProgress(e) {
      if (!this.totalLength) {
        this.totalLength = e.total;
        if (e.total !== null && e.total !== 0) {
          this.totalLength = e.total;
        }
      }

      var chunk = e.target.response;
      this.arrivalDataCallback(chunk, this.bytesStart);
      this.bytesStart += chunk.byteLength;
    }

    /**
     * xhr onLoadEnd
     */

  }, {
    key: 'onLoadEnd',
    value: function onLoadEnd(e) {
      this.emit(this.tag, 'video load end');
    }

    /**
     * xhr onXhrError
     */

  }, {
    key: 'onXhrError',
    value: function onXhrError(e) {
      var info = {
        from: this.range.from,
        to: this.range.to,
        url: this.src,
        msg: e.constructor.name + ' ' + e.type
      };
      this.emit(this.tag, info);
    }
  }]);

  return MozChunkLoader;
}(CustEvent);

/**
* 处理range的静态函数
* author songguangyu
* emil 522963130@qq.com
*/

/**
 * Ioloader 处理io的调用器 缓存多余数据
 * @class Ioloader
 * @param  {object} video config
 */

var Ioloader = function (_CustEvent) {
	_inherits(Ioloader, _CustEvent);

	function Ioloader(config) {
		_classCallCheck(this, Ioloader);

		var _this = _possibleConstructorReturn(this, (Ioloader.__proto__ || _Object$getPrototypeOf(Ioloader)).call(this));

		_this.loader = null;
		_this.config = {};
		_Object$assign(_this.config, config);
		_this.bufferSize = 1024 * 1024 * 3; // initial size: 3MB
		_this.cacheBuffer = new ArrayBuffer(_this.bufferSize);
		_this.cacheRemain = 0;
		_this.stashByteStart = 0;
		_this.enableStash = true;
		_this.stashSize = 1024 * 384;
		_this.resumeFrom = 0;
		_this.currentRange = {};
		_this.totalReceive = 0;
		_this.seekPonit = 0;
		_this.timer = null;
		_this.webSocketURLReg = /wss?:\/\/(.+?)\//;
		_this.selectLoader();
		return _this;
	}

	/**
 * 自动选择io处理器
 */


	_createClass(Ioloader, [{
		key: 'selectLoader',
		value: function selectLoader() {
			var config = this.config;
			var url = this.config.src;

			if (this.webSocketURLReg.test(url)) {
				this.loader = new WebSocketLoader(url, config);
			} else if (FetchLoader.isSupport()) {
				this.loader = new FetchLoader(url, config);
			} else if (MozChunkLoader.isSupport()) {
				this.loader = new MozChunkLoader(url, config);
			} else if (RangeLoader.isSupport()) {
				this.loader = new RangeLoader(url, config);
			}
			this.loader.arrivalDataCallback = this.onLoaderChunkArrival.bind(this);
		}

		/**
  * 数据接收器
  * @param  {arrayBuffer} chunk data
  * @param  {number} chunk byte postion
  */

	}, {
		key: 'onLoaderChunkArrival',
		value: function onLoaderChunkArrival(chunk, byteStart, keyframePoint) {
			if (keyframePoint) {
				this.seekPonit = keyframePoint;
			}
			if (this.arrivalDataCallback) {
				this.totalReceive += chunk.byteLength;

				if (this.cacheRemain === 0 && this.stashByteStart === 0) {
					// This is the first chunk after seek action
					this.stashByteStart = byteStart;
				}
				if (this.cacheRemain + chunk.byteLength <= this.stashSize) {
					// 小于cache大小 则看做数据太小 进行缓存 不进行下发
					var stashArray = new Uint8Array(this.cacheBuffer, 0, this.stashSize);
					stashArray.set(new Uint8Array(chunk), this.cacheRemain);
					this.cacheRemain += chunk.byteLength;
				} else {
					// 大于cache大小的 则把数据放入播放器 溢出数据进行缓存
					var _stashArray = new Uint8Array(this.cacheBuffer, 0, this.bufferSize);
					if (this.cacheRemain > 0) {
						// There're stash datas in buffer
						// dispatch the whole stashBuffer, and stash remain data
						// then append chunk to stashBuffer (stash)
						var buffer = this.cacheBuffer.slice(0, this.cacheRemain);
						var consumed = 0;
						if (this.seekPonit) {
							consumed = this.arrivalDataCallback(buffer, this.stashByteStart, this.seekPonit);
							this.seekPonit = 0;
						} else {
							consumed = this.arrivalDataCallback(buffer, this.stashByteStart);
						}
						// const consumed = this.arrivalDataCallback(buffer, this.stashByteStart, keyframePoint);
						if (consumed < buffer.byteLength) {
							if (consumed > 0) {
								var remainArray = new Uint8Array(buffer, consumed);
								_stashArray.set(remainArray, 0);
								this.cacheRemain = remainArray.byteLength;
								this.stashByteStart += consumed;
							}
						} else {
							this.cacheRemain = 0;
							this.stashByteStart += consumed;
						}
						if (this.cacheRemain + chunk.byteLength > this.bufferSize) {
							this.expandBuffer(this.cacheRemain + chunk.byteLength);
							_stashArray = new Uint8Array(this.cacheBuffer, 0, this.bufferSize);
						}
						_stashArray.set(new Uint8Array(chunk), this.cacheRemain);
						this.cacheRemain += chunk.byteLength;
					} else {
						// stash buffer empty, but chunkSize > stashSize (oh, holy shit)
						// dispatch chunk directly and stash remain data
						// const consumed = this.arrivalDataCallback(chunk, byteStart, keyframePoint);
						var _consumed = 0;
						if (this.seekPonit) {
							_consumed = this.arrivalDataCallback(chunk, byteStart, this.seekPonit);
							this.seekPonit = 0;
						} else {
							_consumed = this.arrivalDataCallback(chunk, byteStart);
						}
						if (_consumed < chunk.byteLength) {
							var remain = chunk.byteLength - _consumed;
							if (remain > this.bufferSize) {
								this.expandBuffer(remain);
								_stashArray = new Uint8Array(this.cacheBuffer, 0, this.bufferSize);
							}
							_stashArray.set(new Uint8Array(chunk, _consumed), 0);
							this.cacheRemain += remain;
							this.stashByteStart = byteStart + _consumed;
						}
					}
				}
			}
		}
		/**
  * 清空缓存buffer
  */

	}, {
		key: 'initCacheBuffer',
		value: function initCacheBuffer() {
			this.cacheBuffer = new ArrayBuffer(this.bufferSize);
		}

		/**
  * 动态扩展buffer存储器大小
  * @param  {number} chunk byte size
  */

	}, {
		key: 'expandBuffer',
		value: function expandBuffer(expectedBytes) {
			var bufferNewSize = this.bufferSize;
			// while (bufferNewSize < expectedBytes) {
			//   bufferNewSize *= 2;
			// }
			if (bufferNewSize < expectedBytes) {
				bufferNewSize = expectedBytes;
			}
			this.cacheBuffer = new ArrayBuffer(bufferNewSize);
			this.bufferSize = bufferNewSize;
		}

		/**
  * 暂停
  */

	}, {
		key: 'pause',
		value: function pause() {
			// if (this.cacheRemain !== 0) {
			//     this.resumeFrom = this.stashByteStart;
			//     this.currentRange.to = this.stashByteStart - 1;
			//   } else {
			//      this.resumeFrom = this.currentRange.to + 1;
			//   }
			this.loader.pause();
		}

		/**
  * 打开连接
  */

	}, {
		key: 'open',
		value: function open(StartBytes) {
			if (StartBytes === undefined) {
				StartBytes = 0;
			}
			this.loader.open({ from: StartBytes, to: -1 });
		}

		/**
  * 重新播放
  */

	}, {
		key: 'resume',
		value: function resume() {
			this.paused = false;
			var bytes = this.totalReceive;
			this.open(bytes);
		}

		/**
  * seek
  */

	}, {
		key: 'seek',
		value: function seek(bytes, dropCache, keyframePoint) {
			this.loader.open({ from: bytes, to: -1 }, keyframePoint);
		}

		/**
  * destory
  */

	}, {
		key: 'destroy',
		value: function destroy() {
			this.pause();
			this.cacheBuffer = null;
		}
	}]);

	return Ioloader;
}(CustEvent);

/* eslint-disable */
var FlvTag = function () {
    function FlvTag() {
        _classCallCheck(this, FlvTag);

        this.tagType = -1;
        this.dataSize = -1;
        this.Timestamp = -1;
        this.StreamID = -1;
        this.body = -1;
        this.time = -1;
        this.arr = [];
    }

    _createClass(FlvTag, [{
        key: 'getTime',
        value: function getTime() {
            // this.Timestamp.pop();
            this.arr = [];
            for (var i = 0; i < this.Timestamp.length; i++) {
                this.arr.push(this.Timestamp[i].toString(16).length == 1 ? '0' + this.Timestamp[i].toString(16) : this.Timestamp[i].toString(16));
            }
            this.arr.pop();
            var time = this.arr.join('');
            this.time = parseInt(time, 16);
            return parseInt(time, 16);
        }
    }]);

    return FlvTag;
}();

/* eslint-disable */
function decodeUTF8(uint8array) {
    var out = [];
    var input = uint8array;
    var i = 0;
    var length = uint8array.length;

    while (i < length) {
        if (input[i] < 0x80) {
            out.push(String.fromCharCode(input[i]));
            ++i;
            continue;
        } else if (input[i] < 0xC0) {
            // fallthrough
        } else if (input[i] < 0xE0) {
            if (checkContinuation(input, i, 1)) {
                var ucs4 = (input[i] & 0x1F) << 6 | input[i + 1] & 0x3F;
                if (ucs4 >= 0x80) {
                    out.push(String.fromCharCode(ucs4 & 0xFFFF));
                    i += 2;
                    continue;
                }
            }
        } else if (input[i] < 0xF0) {
            if (checkContinuation(input, i, 2)) {
                var _ucs = (input[i] & 0xF) << 12 | (input[i + 1] & 0x3F) << 6 | input[i + 2] & 0x3F;
                if (_ucs >= 0x800 && (_ucs & 0xF800) !== 0xD800) {
                    out.push(String.fromCharCode(_ucs & 0xFFFF));
                    i += 3;
                    continue;
                }
            }
        } else if (input[i] < 0xF8) {
            if (checkContinuation(input, i, 3)) {
                var _ucs2 = (input[i] & 0x7) << 18 | (input[i + 1] & 0x3F) << 12 | (input[i + 2] & 0x3F) << 6 | input[i + 3] & 0x3F;
                if (_ucs2 > 0x10000 && _ucs2 < 0x110000) {
                    _ucs2 -= 0x10000;
                    out.push(String.fromCharCode(_ucs2 >>> 10 | 0xD800));
                    out.push(String.fromCharCode(_ucs2 & 0x3FF | 0xDC00));
                    i += 4;
                    continue;
                }
            }
        }
        out.push(String.fromCharCode(0xFFFD));
        ++i;
    }

    return out.join('');
}

function checkContinuation(uint8array, start, checkLength) {
    var array = uint8array;
    if (start + checkLength < array.length) {
        while (checkLength--) {
            if ((array[++start] & 0xC0) !== 0x80) return false;
        }
        return true;
    } else {
        return false;
    }
}

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
// Exponential-Golomb buffer decoder
var ExpGolomb = function () {
    function ExpGolomb(uint8array) {
        _classCallCheck(this, ExpGolomb);

        this.TAG = this.constructor.name;

        this._buffer = uint8array;
        this._buffer_index = 0;
        this._total_bytes = uint8array.byteLength;
        this._total_bits = uint8array.byteLength * 8;
        this._current_word = 0;
        this._current_word_bits_left = 0;
    }

    _createClass(ExpGolomb, [{
        key: 'destroy',
        value: function destroy() {
            this._buffer = null;
        }
    }, {
        key: '_fillCurrentWord',
        value: function _fillCurrentWord() {
            var buffer_bytes_left = this._total_bytes - this._buffer_index;
            if (buffer_bytes_left <= 0) {
                throw new IllegalStateException('ExpGolomb: _fillCurrentWord() but no bytes available');
            }

            var bytes_read = Math.min(4, buffer_bytes_left);
            var word = new Uint8Array(4);
            word.set(this._buffer.subarray(this._buffer_index, this._buffer_index + bytes_read));
            this._current_word = new DataView(word.buffer).getUint32(0, false);

            this._buffer_index += bytes_read;
            this._current_word_bits_left = bytes_read * 8;
        }
    }, {
        key: 'readBits',
        value: function readBits(bits) {
            if (bits > 32) {
                throw new InvalidArgumentException('ExpGolomb: readBits() bits exceeded max 32bits!');
            }

            if (bits <= this._current_word_bits_left) {
                var _result = this._current_word >>> 32 - bits;
                this._current_word <<= bits;
                this._current_word_bits_left -= bits;
                return _result;
            }

            var result = this._current_word_bits_left ? this._current_word : 0;
            result = result >>> 32 - this._current_word_bits_left;
            var bits_need_left = bits - this._current_word_bits_left;

            this._fillCurrentWord();
            var bits_read_next = Math.min(bits_need_left, this._current_word_bits_left);

            var result2 = this._current_word >>> 32 - bits_read_next;
            this._current_word <<= bits_read_next;
            this._current_word_bits_left -= bits_read_next;

            result = result << bits_read_next | result2;
            return result;
        }
    }, {
        key: 'readBool',
        value: function readBool() {
            return this.readBits(1) === 1;
        }
    }, {
        key: 'readByte',
        value: function readByte() {
            return this.readBits(8);
        }
    }, {
        key: '_skipLeadingZero',
        value: function _skipLeadingZero() {
            var zero_count = void 0;
            for (zero_count = 0; zero_count < this._current_word_bits_left; zero_count++) {
                if ((this._current_word & 0x80000000 >>> zero_count) !== 0) {
                    this._current_word <<= zero_count;
                    this._current_word_bits_left -= zero_count;
                    return zero_count;
                }
            }
            this._fillCurrentWord();
            return zero_count + this._skipLeadingZero();
        }
    }, {
        key: 'readUEG',
        value: function readUEG() {
            // unsigned exponential golomb
            var leading_zeros = this._skipLeadingZero();
            return this.readBits(leading_zeros + 1) - 1;
        }
    }, {
        key: 'readSEG',
        value: function readSEG() {
            // signed exponential golomb
            var value = this.readUEG();
            if (value & 0x01) {
                return value + 1 >>> 1;
            } else {
                return -1 * (value >>> 1);
            }
        }
    }]);

    return ExpGolomb;
}();

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
var SPSParser = function () {
    function SPSParser() {
        _classCallCheck(this, SPSParser);
    }

    _createClass(SPSParser, null, [{
        key: '_ebsp2rbsp',
        value: function _ebsp2rbsp(uint8array) {
            var src = uint8array;
            var src_length = src.byteLength;
            var dst = new Uint8Array(src_length);
            var dst_idx = 0;

            for (var i = 0; i < src_length; i++) {
                if (i >= 2) {
                    // Unescape: Skip 0x03 after 00 00
                    if (src[i] === 0x03 && src[i - 1] === 0x00 && src[i - 2] === 0x00) {
                        continue;
                    }
                }
                dst[dst_idx] = src[i];
                dst_idx++;
            }

            return new Uint8Array(dst.buffer, 0, dst_idx);
        }
    }, {
        key: 'parseSPS',
        value: function parseSPS(uint8array) {
            var rbsp = SPSParser._ebsp2rbsp(uint8array);
            var gb = new ExpGolomb(rbsp);

            gb.readByte();
            var profile_idc = gb.readByte(); // profile_idc
            gb.readByte(); // constraint_set_flags[5] + reserved_zero[3]
            var level_idc = gb.readByte(); // level_idc
            gb.readUEG(); // seq_parameter_set_id

            var profile_string = SPSParser.getProfileString(profile_idc);
            var level_string = SPSParser.getLevelString(level_idc);
            var chroma_format_idc = 1;
            var chroma_format = 420;
            var chroma_format_table = [0, 420, 422, 444];
            var bit_depth = 8;

            if (profile_idc === 100 || profile_idc === 110 || profile_idc === 122 || profile_idc === 244 || profile_idc === 44 || profile_idc === 83 || profile_idc === 86 || profile_idc === 118 || profile_idc === 128 || profile_idc === 138 || profile_idc === 144) {

                chroma_format_idc = gb.readUEG();
                if (chroma_format_idc === 3) {
                    gb.readBits(1); // separate_colour_plane_flag
                }
                if (chroma_format_idc <= 3) {
                    chroma_format = chroma_format_table[chroma_format_idc];
                }

                bit_depth = gb.readUEG() + 8; // bit_depth_luma_minus8
                gb.readUEG(); // bit_depth_chroma_minus8
                gb.readBits(1); // qpprime_y_zero_transform_bypass_flag
                if (gb.readBool()) {
                    // seq_scaling_matrix_present_flag
                    var scaling_list_count = chroma_format_idc !== 3 ? 8 : 12;
                    for (var i = 0; i < scaling_list_count; i++) {
                        if (gb.readBool()) {
                            // seq_scaling_list_present_flag
                            if (i < 6) {
                                SPSParser._skipScalingList(gb, 16);
                            } else {
                                SPSParser._skipScalingList(gb, 64);
                            }
                        }
                    }
                }
            }
            gb.readUEG(); // log2_max_frame_num_minus4
            var pic_order_cnt_type = gb.readUEG();
            if (pic_order_cnt_type === 0) {
                gb.readUEG(); // log2_max_pic_order_cnt_lsb_minus_4
            } else if (pic_order_cnt_type === 1) {
                gb.readBits(1); // delta_pic_order_always_zero_flag
                gb.readSEG(); // offset_for_non_ref_pic
                gb.readSEG(); // offset_for_top_to_bottom_field
                var num_ref_frames_in_pic_order_cnt_cycle = gb.readUEG();
                for (var _i = 0; _i < num_ref_frames_in_pic_order_cnt_cycle; _i++) {
                    gb.readSEG(); // offset_for_ref_frame
                }
            }
            gb.readUEG(); // max_num_ref_frames
            gb.readBits(1); // gaps_in_frame_num_value_allowed_flag

            var pic_width_in_mbs_minus1 = gb.readUEG();
            var pic_height_in_map_units_minus1 = gb.readUEG();

            var frame_mbs_only_flag = gb.readBits(1);
            if (frame_mbs_only_flag === 0) {
                gb.readBits(1); // mb_adaptive_frame_field_flag
            }
            gb.readBits(1); // direct_8x8_inference_flag

            var frame_crop_left_offset = 0;
            var frame_crop_right_offset = 0;
            var frame_crop_top_offset = 0;
            var frame_crop_bottom_offset = 0;

            var frame_cropping_flag = gb.readBool();
            if (frame_cropping_flag) {
                frame_crop_left_offset = gb.readUEG();
                frame_crop_right_offset = gb.readUEG();
                frame_crop_top_offset = gb.readUEG();
                frame_crop_bottom_offset = gb.readUEG();
            }

            var sar_width = 1,
                sar_height = 1;
            var fps = 0,
                fps_fixed = true,
                fps_num = 0,
                fps_den = 0;

            var vui_parameters_present_flag = gb.readBool();
            if (vui_parameters_present_flag) {
                if (gb.readBool()) {
                    // aspect_ratio_info_present_flag
                    var aspect_ratio_idc = gb.readByte();
                    var sar_w_table = [1, 12, 10, 16, 40, 24, 20, 32, 80, 18, 15, 64, 160, 4, 3, 2];
                    var sar_h_table = [1, 11, 11, 11, 33, 11, 11, 11, 33, 11, 11, 33, 99, 3, 2, 1];

                    if (aspect_ratio_idc > 0 && aspect_ratio_idc < 16) {
                        sar_width = sar_w_table[aspect_ratio_idc - 1];
                        sar_height = sar_h_table[aspect_ratio_idc - 1];
                    } else if (aspect_ratio_idc === 255) {
                        sar_width = gb.readByte() << 8 | gb.readByte();
                        sar_height = gb.readByte() << 8 | gb.readByte();
                    }
                }

                if (gb.readBool()) {
                    // overscan_info_present_flag
                    gb.readBool(); // overscan_appropriate_flag
                }
                if (gb.readBool()) {
                    // video_signal_type_present_flag
                    gb.readBits(4); // video_format & video_full_range_flag
                    if (gb.readBool()) {
                        // colour_description_present_flag
                        gb.readBits(24); // colour_primaries & transfer_characteristics & matrix_coefficients
                    }
                }
                if (gb.readBool()) {
                    // chroma_loc_info_present_flag
                    gb.readUEG(); // chroma_sample_loc_type_top_field
                    gb.readUEG(); // chroma_sample_loc_type_bottom_field
                }
                if (gb.readBool()) {
                    // timing_info_present_flag
                    var num_units_in_tick = gb.readBits(32);
                    var time_scale = gb.readBits(32);
                    fps_fixed = gb.readBool(); // fixed_frame_rate_flag

                    fps_num = time_scale;
                    fps_den = num_units_in_tick * 2;
                    fps = fps_num / fps_den;
                }
            }

            var sarScale = 1;
            if (sar_width !== 1 || sar_height !== 1) {
                sarScale = sar_width / sar_height;
            }

            var crop_unit_x = 0,
                crop_unit_y = 0;
            if (chroma_format_idc === 0) {
                crop_unit_x = 1;
                crop_unit_y = 2 - frame_mbs_only_flag;
            } else {
                var sub_wc = chroma_format_idc === 3 ? 1 : 2;
                var sub_hc = chroma_format_idc === 1 ? 2 : 1;
                crop_unit_x = sub_wc;
                crop_unit_y = sub_hc * (2 - frame_mbs_only_flag);
            }

            var codec_width = (pic_width_in_mbs_minus1 + 1) * 16;
            var codec_height = (2 - frame_mbs_only_flag) * ((pic_height_in_map_units_minus1 + 1) * 16);

            codec_width -= (frame_crop_left_offset + frame_crop_right_offset) * crop_unit_x;
            codec_height -= (frame_crop_top_offset + frame_crop_bottom_offset) * crop_unit_y;

            var present_width = Math.ceil(codec_width * sarScale);

            gb.destroy();
            gb = null;

            return {
                profile_string: profile_string, // baseline, high, high10, ...
                level_string: level_string, // 3, 3.1, 4, 4.1, 5, 5.1, ...
                bit_depth: bit_depth, // 8bit, 10bit, ...
                chroma_format: chroma_format, // 4:2:0, 4:2:2, ...
                chroma_format_string: SPSParser.getChromaFormatString(chroma_format),

                frame_rate: {
                    fixed: fps_fixed,
                    fps: fps,
                    fps_den: fps_den,
                    fps_num: fps_num
                },

                sar_ratio: {
                    width: sar_width,
                    height: sar_height
                },

                codec_size: {
                    width: codec_width,
                    height: codec_height
                },

                present_size: {
                    width: present_width,
                    height: codec_height
                }
            };
        }
    }, {
        key: '_skipScalingList',
        value: function _skipScalingList(gb, count) {
            var last_scale = 8,
                next_scale = 8;
            var delta_scale = 0;
            for (var i = 0; i < count; i++) {
                if (next_scale !== 0) {
                    delta_scale = gb.readSEG();
                    next_scale = (last_scale + delta_scale + 256) % 256;
                }
                last_scale = next_scale === 0 ? last_scale : next_scale;
            }
        }
    }, {
        key: 'getProfileString',
        value: function getProfileString(profile_idc) {
            switch (profile_idc) {
                case 66:
                    return 'Baseline';
                case 77:
                    return 'Main';
                case 88:
                    return 'Extended';
                case 100:
                    return 'High';
                case 110:
                    return 'High10';
                case 122:
                    return 'High422';
                case 244:
                    return 'High444';
                default:
                    return 'Unknown';
            }
        }
    }, {
        key: 'getLevelString',
        value: function getLevelString(level_idc) {
            return (level_idc / 10).toFixed(1);
        }
    }, {
        key: 'getChromaFormatString',
        value: function getChromaFormatString(chroma) {
            switch (chroma) {
                case 420:
                    return '4:2:0';
                case 422:
                    return '4:2:2';
                case 444:
                    return '4:4:4';
                default:
                    return 'Unknown';
            }
        }
    }]);

    return SPSParser;
}();

/* eslint-disable */
var le = function () {
    var buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, 256, true); // little-endian write
    return new Int16Array(buf)[0] === 256; // platform-spec read, if equal then LE
}();

var flvDemux = function () {
    function flvDemux() {
        _classCallCheck(this, flvDemux);
    }

    _createClass(flvDemux, null, [{
        key: 'parseObject',
        value: function parseObject(arrayBuffer, dataOffset, dataSize) {

            var name = flvDemux.parseString(arrayBuffer, dataOffset, dataSize);
            var value = flvDemux.parseScript(arrayBuffer, dataOffset + name.size);
            var isObjectEnd = value.objectEnd;

            return {
                data: {
                    name: name.data,
                    value: value.data
                },
                size: value.size,
                objectEnd: isObjectEnd
            };
        }
    }, {
        key: 'parseVariable',
        value: function parseVariable(arrayBuffer, dataOffset, dataSize) {
            return flvDemux.parseObject(arrayBuffer, dataOffset, dataSize);
        }
    }, {
        key: 'parseLongString',
        value: function parseLongString(arrayBuffer, dataOffset, dataSize) {

            var v = new DataView(arrayBuffer, dataOffset);
            var length = v.getUint32(0, !le);

            var str = void 0;
            if (length > 0) {
                str = decodeUTF8(new Uint8Array(arrayBuffer, dataOffset + 4, length));
            } else {
                str = '';
            }

            return {
                data: str,
                size: 4 + length
            };
        }
    }, {
        key: 'parseDate',
        value: function parseDate(arrayBuffer, dataOffset, dataSize) {

            var v = new DataView(arrayBuffer, dataOffset);
            var timestamp = v.getFloat64(0, !le);
            var localTimeOffset = v.getInt16(8, !le);
            timestamp += localTimeOffset * 60 * 1000; // get UTC time

            return {
                data: new Date(timestamp),
                size: 8 + 2
            };
        }
    }, {
        key: 'parseString',
        value: function parseString(arrayBuffer, dataOffset, dataSize) {
            var v = new DataView(arrayBuffer, dataOffset);
            var length = v.getUint16(0, !le);
            var str = void 0;
            if (length > 0) {
                str = decodeUTF8(new Uint8Array(arrayBuffer, dataOffset + 2, length));
            } else {
                str = '';
            }
            return {
                data: str,
                size: 2 + length
            };
        }

        /**
         * 解析metadata
         */

    }, {
        key: 'parseMetadata',
        value: function parseMetadata(arr) {
            var name = flvDemux.parseScript(arr, 0);
            var value = flvDemux.parseScript(arr, name.size, arr.length - name.size);
            // return {}
            var data = {};
            data[name.data] = value.data;
            return data;
        }
    }, {
        key: 'parseScript',
        value: function parseScript(arr, offset, dataSize) {
            var dataOffset = offset;
            var object = {};
            var uint8 = new Uint8Array(arr);
            var buffer = uint8.buffer;
            var dv = new DataView(buffer, 0, dataSize);
            var value = null;
            var objectEnd = false;
            var type = dv.getUint8(dataOffset);
            dataOffset += 1;

            switch (type) {
                case 0:
                    // Number(Double) type
                    value = dv.getFloat64(dataOffset, !le);
                    dataOffset += 8;
                    break;
                case 1:
                    {
                        // Boolean type
                        var b = dv.getUint8(dataOffset);
                        value = !!b;
                        dataOffset += 1;
                        break;
                    }
                case 2:
                    {
                        // String type
                        // dataOffset += 1;
                        var amfstr = flvDemux.parseString(buffer, dataOffset);
                        value = amfstr.data;
                        dataOffset += amfstr.size;
                        break;
                    }
                case 3:

                    {
                        // Object(s) type
                        value = {};
                        var terminal = 0; // workaround for malformed Objects which has missing ScriptDataObjectEnd
                        if ((dv.getUint32(dataSize - 4, !le) & 0x00FFFFFF) === 9) {
                            terminal = 3;
                        }
                        while (dataOffset < dataSize - 4) {
                            // 4 === type(UI8) + ScriptDataObjectEnd(UI24)
                            var amfobj = flvDemux.parseObject(buffer, dataOffset, dataSize - offset - terminal);

                            if (amfobj.objectEnd) {
                                break;
                            }
                            value[amfobj.data.name] = amfobj.data.value;
                            // dataOffset += amfobj.size;
                            dataOffset = amfobj.size;
                        }
                        if (dataOffset <= dataSize - 3) {
                            var marker = v.getUint32(dataOffset - 1, !le) & 0x00FFFFFF;
                            if (marker === 9) {
                                dataOffset += 3;
                            }
                        }
                        break;
                    }
                case 8:
                    {
                        // ECMA array type (Mixed array)
                        value = {};
                        // dataOffset += 1;
                        dataOffset += 4; // ECMAArrayLength(UI32)
                        var _terminal = 0; // workaround for malformed MixedArrays which has missing ScriptDataObjectEnd
                        if ((dv.getUint32(dataSize - 4, !le) & 0x00FFFFFF) === 9) {
                            _terminal = 3;
                        }
                        while (dataOffset < dataSize - 8) {
                            // 8 === type(UI8) + ECMAArrayLength(UI32) + ScriptDataVariableEnd(UI24)
                            var amfvar = flvDemux.parseVariable(buffer, dataOffset);

                            if (amfvar.objectEnd) {
                                break;
                            }
                            value[amfvar.data.name] = amfvar.data.value;
                            dataOffset = amfvar.size;
                        }
                        if (dataOffset <= dataSize - 3) {
                            var _marker = dv.getUint32(dataOffset - 1, !le) & 0x00FFFFFF;
                            if (_marker === 9) {
                                dataOffset += 3;
                            }
                        }
                        break;
                    }
                case 9:
                    // ScriptDataObjectEnd
                    value = undefined;
                    dataOffset = 1;
                    objectEnd = true;
                    break;
                case 10:
                    {
                        // Strict array type
                        // ScriptDataValue[n]. NOTE: according to video_file_format_spec_v10_1.pdf
                        value = [];
                        var strictArrayLength = dv.getUint32(dataOffset, !le);
                        dataOffset += 4;
                        for (var i = 0; i < strictArrayLength; i++) {
                            var val = flvDemux.parseScript(buffer, dataOffset);
                            value.push(val.data);
                            dataOffset = val.size;
                        }
                        break;
                    }
                case 11:
                    {
                        // Date type
                        var date = flvDemux.parseDate(buffer, dataOffset + 1, dataSize - 1);
                        value = date.data;
                        dataOffset += date.size;
                        break;
                    }
                case 12:
                    {
                        // Long string type
                        var amfLongStr = flvDemux.parseString(buffer, dataOffset + 1, dataSize - 1);
                        value = amfLongStr.data;
                        dataOffset += amfLongStr.size;
                        break;
                    }
                default:
                    // ignore and skip
                    dataOffset = dataSize;
                    console.log('AMF', 'Unsupported AMF value type ' + type);
            }
            return {
                data: value,
                size: dataOffset
            };
        }
    }]);

    return flvDemux;
}();

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
var MediaInfo = function () {
    function MediaInfo() {
        _classCallCheck(this, MediaInfo);

        this.mimeType = null;
        this.duration = null;

        this.hasAudio = null;
        this.hasVideo = null;
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioDataRate = null;
        this.videoDataRate = null;

        this.audioSampleRate = null;
        this.audioChannelCount = null;

        this.width = null;
        this.height = null;
        this.fps = null;
        this.profile = null;
        this.level = null;
        this.chromaFormat = null;
        this.sarNum = null;
        this.sarDen = null;

        this.metadata = null;
        this.segments = null; // MediaInfo[]
        this.segmentCount = null;
        this.hasKeyframesIndex = null;
        this.keyframesIndex = null;
    }

    _createClass(MediaInfo, [{
        key: "isComplete",
        value: function isComplete() {
            var audioInfoComplete = this.hasAudio === false || this.hasAudio === true && this.audioCodec != null && this.audioSampleRate != null && this.audioChannelCount != null;

            var videoInfoComplete = this.hasVideo === false || this.hasVideo === true && this.videoCodec != null && this.width != null && this.height != null && this.fps != null && this.profile != null && this.level != null && this.chromaFormat != null && this.sarNum != null && this.sarDen != null;

            // keyframesIndex may not be present
            return this.mimeType != null && this.duration != null && this.metadata != null && this.hasKeyframesIndex != null && audioInfoComplete && videoInfoComplete;
        }
    }, {
        key: "isSeekable",
        value: function isSeekable() {
            return this.hasKeyframesIndex === true;
        }
    }]);

    return MediaInfo;
}();

var Error$1 = function Error(type) {
    _classCallCheck(this, Error);

    this.type = type;
};

/* eslint-disable */
var tagDemux = function () {
    function tagDemux() {
        _classCallCheck(this, tagDemux);

        this.TAG = this.constructor.name;

        this._config = {};

        this._onError = null;
        this._onMediaInfo = null;
        this._onTrackMetadata = null;
        this._onDataAvailable = null;

        this._dataOffset = 0;
        this._firstParse = true;
        this._dispatch = false;

        this._hasAudio = false;
        this._hasVideo = false;

        this._audioInitialMetadataDispatched = false;
        this._videoInitialMetadataDispatched = false;

        this._mediaInfo = new MediaInfo();
        this._mediaInfo.hasAudio = this._hasAudio;
        this._mediaInfo.hasVideo = this._hasVideo;
        this._metadata = null;
        this._audioMetadata = null;
        this._videoMetadata = null;

        this._naluLengthSize = 4;
        this._timestampBase = 0; // int32, in milliseconds
        this._timescale = 1000;
        this._duration = 0; // int32, in milliseconds
        this._durationOverrided = false;
        this._referenceFrameRate = {
            fixed: true,
            fps: 23.976,
            fps_num: 23976,
            fps_den: 1000
        };

        this._videoTrack = { type: 'video', id: 1, sequenceNumber: 0, addcoefficient: 2, samples: [], length: 0 };
        this._audioTrack = { type: 'audio', id: 2, sequenceNumber: 1, addcoefficient: 2, samples: [], length: 0 };

        this._littleEndian = function () {
            var buf = new ArrayBuffer(2);
            new DataView(buf).setInt16(0, 256, true); // little-endian write
            return new Int16Array(buf)[0] === 256; // platform-spec read, if equal then LE
        }();
    }

    _createClass(tagDemux, [{
        key: 'onMediaInfo',
        value: function onMediaInfo(callback) {
            this._onMediaInfo = callback;
        }
    }, {
        key: 'parseMetadata',
        value: function parseMetadata(arr) {
            var data = flvDemux.parseMetadata(arr);
            this._parseScriptData(data);
        }
    }, {
        key: '_parseScriptData',
        value: function _parseScriptData(obj) {
            var scriptData = obj;

            if (scriptData.hasOwnProperty('onMetaData')) {
                if (this._metadata) {
                    console.log(this.TAG, 'Found another onMetaData tag!');
                }
                this._metadata = scriptData;
                var onMetaData = this._metadata.onMetaData;

                if (typeof onMetaData.hasAudio === 'boolean') {
                    // hasAudio
                    this._hasAudio = onMetaData.hasAudio;
                    this._mediaInfo.hasAudio = this._hasAudio;
                }
                if (typeof onMetaData.hasVideo === 'boolean') {
                    // hasVideo
                    this._hasVideo = onMetaData.hasVideo;
                    this._mediaInfo.hasVideo = this._hasVideo;
                }
                if (typeof onMetaData.audiodatarate === 'number') {
                    // audiodatarate
                    this._mediaInfo.audioDataRate = onMetaData.audiodatarate;
                }
                if (typeof onMetaData.videodatarate === 'number') {
                    // videodatarate
                    this._mediaInfo.videoDataRate = onMetaData.videodatarate;
                }
                if (typeof onMetaData.width === 'number') {
                    // width
                    this._mediaInfo.width = onMetaData.width;
                }
                if (typeof onMetaData.height === 'number') {
                    // height
                    this._mediaInfo.height = onMetaData.height;
                }
                if (typeof onMetaData.duration === 'number') {
                    // duration
                    if (!this._durationOverrided) {
                        var duration = Math.floor(onMetaData.duration * this._timescale);
                        this._duration = duration;
                        this._mediaInfo.duration = duration;
                    }
                } else {
                    this._mediaInfo.duration = 0;
                }
                if (typeof onMetaData.framerate === 'number') {
                    // framerate
                    var fps_num = Math.floor(onMetaData.framerate * 1000);
                    if (fps_num > 0) {
                        var fps = fps_num / 1000;
                        this._referenceFrameRate.fixed = true;
                        this._referenceFrameRate.fps = fps;
                        this._referenceFrameRate.fps_num = fps_num;
                        this._referenceFrameRate.fps_den = 1000;
                        this._mediaInfo.fps = fps;
                    }
                }
                if (_typeof(onMetaData.keyframes) === 'object') {
                    // keyframes
                    this._mediaInfo.hasKeyframesIndex = true;
                    var keyframes = onMetaData.keyframes;
                    keyframes.times = onMetaData.times;
                    keyframes.filepositions = onMetaData.filepositions;
                    this._mediaInfo.keyframesIndex = this._parseKeyframesIndex(keyframes);
                    onMetaData.keyframes = null; // keyframes has been extracted, remove it
                } else {
                    this._mediaInfo.hasKeyframesIndex = false;
                }
                this._dispatch = false;
                this._mediaInfo.metadata = onMetaData;
                console.log(this.TAG, 'Parsed onMetaData');
                // if (this._mediaInfo.isComplete()) {
                // this._onMediaInfo(this._mediaInfo);
                // }
                return this._mediaInfo;
            }
        }
    }, {
        key: '_parseKeyframesIndex',
        value: function _parseKeyframesIndex(keyframes) {
            var times = [];
            var filepositions = [];

            // ignore first keyframe which is actually AVC Sequence Header (AVCDecoderConfigurationRecord)
            for (var i = 1; i < keyframes.times.length; i++) {
                var time = this._timestampBase + Math.floor(keyframes.times[i] * 1000);
                times.push(time);
                filepositions.push(keyframes.filepositions[i]);
            }

            return {
                times: times,
                filepositions: filepositions
            };
        }

        /**
         * 传入tags输出moof和mdat
         *
         * @param {any} tags
         *
         * @memberof tagDemux
         */

    }, {
        key: 'moofTag',
        value: function moofTag(tags) {

            for (var i = 0; i < tags.length; i++) {
                this._dispatch = true;
                this.parseChunks(tags[i]);
                // console.log("tagTimestamp", tags[i].getTime(), tags[i]);
            }
            if (this._isInitialMetadataDispatched()) {
                if (this._dispatch && (this._audioTrack.length || this._videoTrack.length)) {
                    this._onDataAvailable(this._audioTrack, this._videoTrack);
                }
            }
        }
    }, {
        key: 'parseChunks',
        value: function parseChunks(flvtag) {

            switch (flvtag.tagType) {
                case 8:
                    // Audio
                    this._parseAudioData(flvtag.body.buffer, 0, flvtag.body.length, flvtag.getTime());
                    break;
                case 9:
                    // Video
                    this._parseVideoData(flvtag.body.buffer, 0, flvtag.body.length, flvtag.getTime(), 0);
                    break;
                case 18:
                    // ScriptDataObject
                    this.parseMetadata(flvtag.body);
                    break;
            }
        }
    }, {
        key: '_parseVideoData',
        value: function _parseVideoData(arrayBuffer, dataOffset, dataSize, tagTimestamp, tagPosition) {
            if (tagTimestamp == this._timestampBase && this._timestampBase != 0) {
                throw new Error$1(tagTimestamp + this._timestampBase + '夭寿啦这个视频不是从0开始');
                // this.timestampBase(0);
            }
            if (dataSize <= 1) {
                console.log(this.TAG, 'Flv: Invalid video packet, missing VideoData payload!');
                return;
            }
            // 获取 video tag body 第一字节
            var spec = new Uint8Array(arrayBuffer, dataOffset, dataSize)[0];
            // 获取是否是关键帧
            var frameType = (spec & 240) >>> 4;
            // 获取编码格式
            var codecId = spec & 15;

            if (codecId !== 7) {
                throw new Error$1('Flv: Unsupported codec in video frame: ' + codecId);
                // return;
            }

            this._parseAVCVideoPacket(arrayBuffer, dataOffset + 1, dataSize - 1, tagTimestamp, tagPosition, frameType);
        }
    }, {
        key: '_parseAVCVideoPacket',
        value: function _parseAVCVideoPacket(arrayBuffer, dataOffset, dataSize, tagTimestamp, tagPosition, frameType) {

            if (dataSize < 4) {
                console.log(this.TAG, 'Flv: Invalid AVC packet, missing AVCPacketType or/and CompositionTime');
                return;
            }

            var le = this._littleEndian;
            // 获取 video tag body 第2字节到结尾
            var v = new DataView(arrayBuffer, dataOffset, dataSize);

            // IF CodecID == 7  AVCPacketType
            // 0 = AVC sequence header
            // 1 = AVC NALU
            // 2 = AVC end of sequence (lower level NALU sequence ender is not required or supported)
            var packetType = v.getUint8(0);
            // 3字节
            // IF AVCPacketType == 1
            //  Composition time offset
            // ELSE
            //  0
            var cts = v.getUint32(0, !le) & 0x00FFFFFF;

            // IF AVCPacketType == 0 AVCDecoderConfigurationRecord（AVC sequence header）
            // IF AVCPacketType == 1 One or more NALUs (Full frames are required)

            /**
             *AVCDecoderConfigurationRecord.包含着是H.264解码相关比较重要的sps和pps信息，
             *再给AVC解码器送数据 流之前一定要把sps和pps信息送出，否则的话解码器不能正常解码。
             *而且在解码器stop之后再次start之前，如seek、快进快退状态切换等，
             *都 需要重新送一遍sps和pps的信息.AVCDecoderConfigurationRecord在FLV文件中一般情况也是出现1次，
             *也就是第一个 video tag.
             */
            if (packetType === 0) {
                // AVCDecoderConfigurationRecord
                this._parseAVCDecoderConfigurationRecord(arrayBuffer, dataOffset + 4, dataSize - 4);
            } else if (packetType === 1) {
                // One or more Nalus
                this._parseAVCVideoData(arrayBuffer, dataOffset + 4, dataSize - 4, tagTimestamp, tagPosition, frameType, cts);
            } else if (packetType === 2) {
                // empty, AVC end of sequence
            } else {
                throw new Error$1('Flv: Invalid video packet type ' + packetType);
            }
        }

        /**
         * AVC 初始化
         */

    }, {
        key: '_parseAVCDecoderConfigurationRecord',
        value: function _parseAVCDecoderConfigurationRecord(arrayBuffer, dataOffset, dataSize) {
            if (dataSize < 7) {
                console.log(this.TAG, 'Flv: Invalid AVCDecoderConfigurationRecord, lack of data!');
                return;
            }

            var meta = this._videoMetadata;
            var track = this._videoTrack;
            var le = this._littleEndian;
            var v = new DataView(arrayBuffer, dataOffset, dataSize);

            if (!meta) {
                meta = this._videoMetadata = {};
                meta.type = 'video';
                meta.id = track.id;
                meta.timescale = this._timescale;
                meta.duration = this._duration;
            } else {
                if (typeof meta.avcc !== 'undefined') {
                    console.log(this.TAG, 'Found another AVCDecoderConfigurationRecord!');
                }
            }

            var version = v.getUint8(0); // configurationVersion
            var avcProfile = v.getUint8(1); // avcProfileIndication
            var profileCompatibility = v.getUint8(2); // profile_compatibility
            var avcLevel = v.getUint8(3); // AVCLevelIndication

            if (version !== 1 || avcProfile === 0) {
                this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: Invalid AVCDecoderConfigurationRecord');
                return;
            }

            this._naluLengthSize = (v.getUint8(4) & 3) + 1; // lengthSizeMinusOne
            if (this._naluLengthSize !== 3 && this._naluLengthSize !== 4) {
                // holy shit!!!
                this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: Strange NaluLengthSizeMinusOne: ' + (this._naluLengthSize - 1));
                return;
            }

            var spsCount = v.getUint8(5) & 31; // numOfSequenceParameterSets
            if (spsCount === 0 || spsCount > 1) {
                this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: Invalid H264 SPS count: ' + spsCount);
                return;
            }

            var offset = 6;

            for (var i = 0; i < spsCount; i++) {
                var len = v.getUint16(offset, !le); // sequenceParameterSetLength
                offset += 2;

                if (len === 0) {
                    continue;
                }

                // Notice: Nalu without startcode header (00 00 00 01)
                var sps = new Uint8Array(arrayBuffer, dataOffset + offset, len);
                offset += len;

                var config = SPSParser.parseSPS(sps);
                meta.codecWidth = config.codec_size.width;
                meta.codecHeight = config.codec_size.height;
                meta.presentWidth = config.present_size.width;
                meta.presentHeight = config.present_size.height;
                meta.config = config;
                meta.profile = config.profile_string;
                meta.level = config.level_string;
                meta.bitDepth = config.bit_depth;
                meta.chromaFormat = config.chroma_format;
                meta.sarRatio = config.sar_ratio;
                meta.frameRate = config.frame_rate;

                if (config.frame_rate.fixed === false || config.frame_rate.fps_num === 0 || config.frame_rate.fps_den === 0) {
                    meta.frameRate = this._referenceFrameRate;
                }

                var fps_den = meta.frameRate.fps_den;
                var fps_num = meta.frameRate.fps_num;
                meta.refSampleDuration = Math.floor(meta.timescale * (fps_den / fps_num));

                var codecArray = sps.subarray(1, 4);
                var codecString = 'avc1.';
                for (var j = 0; j < 3; j++) {
                    var h = codecArray[j].toString(16);
                    if (h.length < 2) {
                        h = '0' + h;
                    }
                    codecString += h;
                }
                meta.codec = codecString;

                var mi = this._mediaInfo;
                mi.width = meta.codecWidth;
                mi.height = meta.codecHeight;
                mi.fps = meta.frameRate.fps;
                mi.profile = meta.profile;
                mi.level = meta.level;
                mi.chromaFormat = config.chroma_format_string;
                mi.sarNum = meta.sarRatio.width;
                mi.sarDen = meta.sarRatio.height;
                mi.videoCodec = codecString;
                mi.meta = meta;
                if (mi.hasAudio) {
                    if (mi.audioCodec != null) {
                        mi.mimeType = 'video/x-flv; codecs="' + mi.videoCodec + ',' + mi.audioCodec + '"';
                    }
                } else {
                    mi.mimeType = 'video/x-flv; codecs="' + mi.videoCodec + '"';
                }
                if (mi.isComplete()) {
                    this._onMediaInfo(mi);
                }
            }

            var ppsCount = v.getUint8(offset); // numOfPictureParameterSets
            if (ppsCount === 0 || ppsCount > 1) {
                this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: Invalid H264 PPS count: ' + ppsCount);
                return;
            }

            offset++;

            for (var _i = 0; _i < ppsCount; _i++) {
                var _len = v.getUint16(offset, !le); // pictureParameterSetLength
                offset += 2;

                if (_len === 0) {
                    continue;
                }

                // pps is useless for extracting video information
                offset += _len;
            }

            meta.avcc = new Uint8Array(dataSize);
            meta.avcc.set(new Uint8Array(arrayBuffer, dataOffset, dataSize), 0);
            console.log(this.TAG, 'Parsed AVCDecoderConfigurationRecord');

            if (this._isInitialMetadataDispatched()) {
                // flush parsed frames
                if (this._dispatch && (this._audioTrack.length || this._videoTrack.length)) {
                    this._onDataAvailable(this._audioTrack, this._videoTrack);
                }
            } else {
                this._videoInitialMetadataDispatched = true;
            }
            // notify new metadata
            this._dispatch = false;
            // if (this._onTrackMetadata) {
            //     this._onTrackMetadata.call(null, meta);
            // }

            this._onTrackMetadata('video', meta);
        }
    }, {
        key: 'timestampBase',
        value: function timestampBase(i) {
            this._timestampBase = i;
        }

        /**
         * 普通的AVC 片段
         */

    }, {
        key: '_parseAVCVideoData',
        value: function _parseAVCVideoData(arrayBuffer, dataOffset, dataSize, tagTimestamp, tagPosition, frameType, cts) {

            var le = this._littleEndian;
            var v = new DataView(arrayBuffer, dataOffset, dataSize);

            var units = [],
                length = 0;

            var offset = 0;
            var lengthSize = this._naluLengthSize;
            var dts = this._timestampBase + tagTimestamp;
            var keyframe = frameType === 1; // from FLV Frame Type constants

            while (offset < dataSize) {
                if (offset + 4 >= dataSize) {
                    console.log(this.TAG, 'Malformed Nalu near timestamp ' + dts + ', offset = ' + offset + ', dataSize = ' + dataSize);
                    break; // data not enough for next Nalu
                }
                // Nalu with length-header (AVC1)
                var naluSize = v.getUint32(offset, !le); // Big-Endian read
                if (lengthSize === 3) {
                    naluSize >>>= 8;
                }
                if (naluSize > dataSize - lengthSize) {
                    console.log(this.TAG, 'Malformed Nalus near timestamp ' + dts + ', NaluSize > DataSize!');
                    return;
                }

                var unitType = v.getUint8(offset + lengthSize) & 0x1F;

                if (unitType === 5) {
                    // IDR
                    keyframe = true;
                }

                var data = new Uint8Array(arrayBuffer, dataOffset + offset, lengthSize + naluSize);
                var unit = { type: unitType, data: data };
                units.push(unit);
                length += data.byteLength;

                offset += lengthSize + naluSize;
            }

            if (units.length) {
                var track = this._videoTrack;
                var avcSample = {
                    units: units,
                    length: length,
                    isKeyframe: keyframe,
                    dts: dts,
                    cts: cts,
                    pts: dts + cts
                };
                if (keyframe) {
                    avcSample.fileposition = tagPosition;
                }
                track.samples.push(avcSample);
                track.length += length;
            }
        }
    }, {
        key: '_parseAudioData',
        value: function _parseAudioData(arrayBuffer, dataOffset, dataSize, tagTimestamp) {
            if (tagTimestamp == this._timestampBase && this._timestampBase != 0) {
                console.log(tagTimestamp, this._timestampBase, '夭寿啦这个视频不是从0开始');
                // timestampBase(0);
            }

            if (dataSize <= 1) {
                console.log(this.TAG, 'Flv: Invalid audio packet, missing SoundData payload!');
                return;
            }

            var meta = this._audioMetadata;
            var track = this._audioTrack;

            if (!meta || !meta.codec) {
                // initial metadata
                meta = this._audioMetadata = {};
                meta.type = 'audio';
                meta.id = track.id;
                meta.timescale = this._timescale;
                meta.duration = this._duration;

                var le = this._littleEndian;
                var v = new DataView(arrayBuffer, dataOffset, dataSize);

                var soundSpec = v.getUint8(0);

                var soundFormat = soundSpec >>> 4;
                if (soundFormat !== 10) {
                    // AAC
                    // TODO: support MP3 audio codec
                    this._onError(DemuxErrors.CODEC_UNSUPPORTED, 'Flv: Unsupported audio codec idx: ' + soundFormat);
                    return;
                }

                var soundRate = 0;
                var soundRateIndex = (soundSpec & 12) >>> 2;

                var soundRateTable = [5500, 11025, 22050, 44100, 48000];

                if (soundRateIndex < soundRateTable.length) {
                    soundRate = soundRateTable[soundRateIndex];
                } else {
                    this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: Invalid audio sample rate idx: ' + soundRateIndex);
                    return;
                }

                var soundSize = (soundSpec & 2) >>> 1; // unused
                var soundType = soundSpec & 1;

                meta.audioSampleRate = soundRate;
                meta.channelCount = soundType === 0 ? 1 : 2;
                meta.refSampleDuration = Math.floor(1024 / meta.audioSampleRate * meta.timescale);
                meta.codec = 'mp4a.40.5';
            }

            var aacData = this._parseAACAudioData(arrayBuffer, dataOffset + 1, dataSize - 1);
            if (aacData == undefined) {
                return;
            }

            if (aacData.packetType === 0) {
                // AAC sequence header (AudioSpecificConfig)
                if (meta.config) {
                    console.log(this.TAG, 'Found another AudioSpecificConfig!');
                }
                var misc = aacData.data;
                meta.audioSampleRate = misc.samplingRate;
                meta.channelCount = misc.channelCount;
                meta.codec = misc.codec;
                meta.config = misc.config;
                // The decode result of an aac sample is 1024 PCM samples
                meta.refSampleDuration = Math.floor(1024 / meta.audioSampleRate * meta.timescale);
                console.log(this.TAG, 'Parsed AudioSpecificConfig');

                if (this._isInitialMetadataDispatched()) {
                    // Non-initial metadata, force dispatch (or flush) parsed frames to remuxer
                    if (this._dispatch && (this._audioTrack.length || this._videoTrack.length)) {
                        this._onDataAvailable(this._audioTrack, this._videoTrack);
                    }
                } else {
                    this._audioInitialMetadataDispatched = true;
                }
                // then notify new metadata
                this._dispatch = false;
                this._onTrackMetadata('audio', meta);

                var mi = this._mediaInfo;
                mi.audioCodec = 'mp4a.40.' + misc.originalAudioObjectType;
                mi.audioSampleRate = meta.audioSampleRate;
                mi.audioChannelCount = meta.channelCount;
                if (mi.hasVideo) {
                    if (mi.videoCodec != null) {
                        mi.mimeType = 'video/x-flv; codecs="' + mi.videoCodec + ',' + mi.audioCodec + '"';
                    }
                } else {
                    mi.mimeType = 'video/x-flv; codecs="' + mi.audioCodec + '"';
                }
                if (mi.isComplete()) {
                    this._onMediaInfo(mi);
                }
                return;
            } else if (aacData.packetType === 1) {
                // AAC raw frame data
                var dts = this._timestampBase + tagTimestamp;
                var aacSample = { unit: aacData.data, dts: dts, pts: dts };
                track.samples.push(aacSample);
                track.length += aacData.data.length;
            } else {
                console.log(this.TAG, 'Flv: Unsupported AAC data type ' + aacData.packetType);
            }
        }
    }, {
        key: '_parseAACAudioData',
        value: function _parseAACAudioData(arrayBuffer, dataOffset, dataSize) {
            if (dataSize <= 1) {
                console.log(this.TAG, 'Flv: Invalid AAC packet, missing AACPacketType or/and Data!');
                return;
            }

            var result = {};
            var array = new Uint8Array(arrayBuffer, dataOffset, dataSize);

            result.packetType = array[0];

            if (array[0] === 0) {
                result.data = this._parseAACAudioSpecificConfig(arrayBuffer, dataOffset + 1, dataSize - 1);
            } else {
                result.data = array.subarray(1);
            }

            return result;
        }
    }, {
        key: '_parseAACAudioSpecificConfig',
        value: function _parseAACAudioSpecificConfig(arrayBuffer, dataOffset, dataSize) {
            var array = new Uint8Array(arrayBuffer, dataOffset, dataSize);
            var config = null;

            var mpegSamplingRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

            /* Audio Object Type:
               0: Null
               1: AAC Main
               2: AAC LC
               3: AAC SSR (Scalable Sample Rate)
               4: AAC LTP (Long Term Prediction)
               5: HE-AAC / SBR (Spectral Band Replication)
               6: AAC Scalable
            */

            var audioObjectType = 0;
            var originalAudioObjectType = 0;
            var audioExtensionObjectType = null;
            var samplingIndex = 0;
            var extensionSamplingIndex = null;
            // debugger;
            // 5 bits
            audioObjectType = originalAudioObjectType = array[0] >>> 3;
            // 4 bits
            samplingIndex = (array[0] & 0x07) << 1 | array[1] >>> 7;
            if (samplingIndex < 0 || samplingIndex >= mpegSamplingRates.length) {
                this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: AAC invalid sampling frequency index!');
                return;
            }

            var samplingFrequence = mpegSamplingRates[samplingIndex];

            // 4 bits
            var channelConfig = (array[1] & 0x78) >>> 3;
            if (channelConfig < 0 || channelConfig >= 8) {
                this._onError(DemuxErrors.FORMAT_ERROR, 'Flv: AAC invalid channel configuration');
                return;
            }

            if (audioObjectType === 5) {
                // HE-AAC?
                // 4 bits
                extensionSamplingIndex = (array[1] & 0x07) << 1 | array[2] >>> 7;
                // 5 bits
                audioExtensionObjectType = (array[2] & 0x7C) >>> 2;
            }

            // workarounds for various browsers
            var userAgent = self.navigator.userAgent.toLowerCase();

            if (userAgent.indexOf('firefox') !== -1) {
                // firefox: use SBR (HE-AAC) if freq less than 24kHz
                if (samplingIndex >= 6) {
                    audioObjectType = 5;
                    config = new Array(4);
                    extensionSamplingIndex = samplingIndex - 3;
                } else {
                    // use LC-AAC
                    audioObjectType = 2;
                    config = new Array(2);
                    extensionSamplingIndex = samplingIndex;
                }
            } else if (userAgent.indexOf('android') !== -1) {
                // android: always use LC-AAC
                audioObjectType = 2;
                config = new Array(2);
                extensionSamplingIndex = samplingIndex;
            } else {
                // for other browsers, e.g. chrome...
                // Always use HE-AAC to make it easier to switch aac codec profile
                audioObjectType = 5;
                extensionSamplingIndex = samplingIndex;
                config = new Array(4);

                if (samplingIndex >= 6) {
                    extensionSamplingIndex = samplingIndex - 3;
                } else if (channelConfig === 1) {
                    // Mono channel
                    audioObjectType = 2;
                    config = new Array(2);
                    extensionSamplingIndex = samplingIndex;
                }
            }

            config[0] = audioObjectType << 3;
            config[0] |= (samplingIndex & 0x0F) >>> 1;
            config[1] = (samplingIndex & 0x0F) << 7;
            config[1] |= (channelConfig & 0x0F) << 3;
            if (audioObjectType === 5) {
                config[1] |= (extensionSamplingIndex & 0x0F) >>> 1;
                config[2] = (extensionSamplingIndex & 0x01) << 7;
                // extended audio object type: force to 2 (LC-AAC)
                config[2] |= 2 << 2;
                config[3] = 0;
            }

            return {
                config: config,
                samplingRate: samplingFrequence,
                channelCount: channelConfig,
                codec: 'mp4a.40.' + audioObjectType,
                originalAudioObjectType: originalAudioObjectType
            };
        }
    }, {
        key: '_isInitialMetadataDispatched',
        value: function _isInitialMetadataDispatched() {
            if (this._hasAudio && this._hasVideo) {
                // both audio & video
                return this._audioInitialMetadataDispatched && this._videoInitialMetadataDispatched;
            }
            if (this._hasAudio && !this._hasVideo) {
                // audio only
                return this._audioInitialMetadataDispatched;
            }
            if (!this._hasAudio && this._hasVideo) {
                // video only
                return this._videoInitialMetadataDispatched;
            }
        }
    }, {
        key: 'hasAudio',
        set: function set(s) {
            this._mediaInfo.hasAudio = this._hasAudio = s;
        }
    }, {
        key: 'hasVideo',
        set: function set(s) {
            this._mediaInfo.hasVideo = this._hasVideo = s;
        }
    }]);

    return tagDemux;
}();

var tagdemux = new tagDemux();

/* eslint-disable */
var FlvParse = function () {
    function FlvParse() {
        _classCallCheck(this, FlvParse);

        this.tempUint8 = new Uint8Array();
        this.arrTag = [];
        this.index = 0;
        this.tempArr = [];
        this.stop = false;
        this.offset = 0;
        this.frist = true;
        this._hasAudio = false;
        this._hasVideo = false;
    }

    /**
     * 接受 外部的flv二进制数据
     */


    _createClass(FlvParse, [{
        key: 'setFlv',
        value: function setFlv(uint8) {
            this.stop = false;
            this.arrTag = [];
            this.index = 0;
            this.tempUint8 = uint8;
            if (this.tempUint8.length > 13 && this.tempUint8[0] == 70 && this.tempUint8[1] == 76 && this.tempUint8[2] == 86) {
                this.probe(this.tempUint8.buffer);
                this.read(9); // 略掉9个字节的flv header tag
                this.read(4); // 略掉第一个4字节的 tag size
                this.parse();
                this.frist = false;
                return this.offset;
            } else if (!this.frist) {
                return this.parse();
            } else {
                return this.offset;
            }
        }
    }, {
        key: 'probe',
        value: function probe(buffer) {
            var data = new Uint8Array(buffer);
            var mismatch = { match: false };

            if (data[0] !== 0x46 || data[1] !== 0x4C || data[2] !== 0x56 || data[3] !== 0x01) {
                return mismatch;
            }

            var hasAudio = (data[4] & 4) >>> 2 !== 0;
            var hasVideo = (data[4] & 1) !== 0;

            if (!hasAudio && !hasVideo) {
                return mismatch;
            }
            this._hasAudio = tagdemux._hasAudio = hasAudio;
            this._hasVideo = tagdemux._hasVideo = hasVideo;
            return {
                match: true,
                hasAudioTrack: hasAudio,
                hasVideoTrack: hasVideo
            };
        }

        /**
         * 开始解析
         */

    }, {
        key: 'parse',
        value: function parse() {

            while (this.index < this.tempUint8.length && !this.stop) {
                this.offset = this.index;

                var t = new FlvTag();
                if (this.tempUint8.length - this.index >= 11) {
                    t.tagType = this.read(1)[0]; // 取出tag类型
                    t.dataSize = this.read(3); // 取出包体大小
                    t.Timestamp = this.read(4); // 取出解码时间
                    t.StreamID = this.read(3); // 取出stream id
                } else {
                    this.stop = true;
                    continue;
                }
                if (t.tagType == 18 || t.tagType == 8 || t.tagType == 9) {} else {
                    throw new Error$1('wrong tagType' + t.tagType);
                }
                if (this.tempUint8.length - this.index >= this.getBodySum(t.dataSize) + 4) {
                    t.body = this.read(this.getBodySum(t.dataSize)); // 取出body
                    if (t.tagType == 9 && this._hasVideo) {
                        this.arrTag.push(t);
                    }
                    if (t.tagType == 8 && this._hasAudio) {
                        this.arrTag.push(t);
                    }
                    if (t.tagType == 18) {
                        this.arrTag.push(t);
                    }
                    this.read(4);
                } else {
                    this.stop = true;
                    continue;
                }
                this.offset = this.index;
            }

            return this.offset;
        }
    }, {
        key: 'read',
        value: function read(length) {
            // let u8a = new Uint8Array(length);
            // u8a.set(this.tempUint8.subarray(this.index, this.index + length), 0);
            var u8a = this.tempUint8.slice(this.index, this.index + length);
            this.index += length;
            return u8a;
        }

        /**
         * 计算tag包体大小
         */

    }, {
        key: 'getBodySum',
        value: function getBodySum(arr) {
            var _str = '';
            _str += arr[0].toString(16).length == 1 ? '0' + arr[0].toString(16) : arr[0].toString(16);
            _str += arr[1].toString(16).length == 1 ? '0' + arr[1].toString(16) : arr[1].toString(16);
            _str += arr[2].toString(16).length == 1 ? '0' + arr[2].toString(16) : arr[2].toString(16);
            return parseInt(_str, 16);
        }
    }]);

    return FlvParse;
}();

var flvparse = new FlvParse();

/**
 * 代码借鉴了flv.js
 * 增加了自己的注释和写法
 */
/* eslint-disable */
var MP4 = function () {
    function MP4() {
        _classCallCheck(this, MP4);
    }

    _createClass(MP4, null, [{
        key: 'init',
        value: function init() {
            MP4.types = {
                avc1: [],
                avcC: [],
                btrt: [],
                dinf: [],
                dref: [],
                esds: [],
                ftyp: [],
                hdlr: [],
                mdat: [],
                mdhd: [],
                mdia: [],
                mfhd: [],
                minf: [],
                moof: [],
                moov: [],
                mp4a: [],
                mvex: [],
                mvhd: [],
                sdtp: [],
                stbl: [],
                stco: [],
                stsc: [],
                stsd: [],
                stsz: [],
                stts: [],
                tfdt: [],
                tfhd: [],
                traf: [],
                trak: [],
                trun: [],
                trex: [],
                tkhd: [],
                vmhd: [],
                smhd: []
            };

            for (var name in MP4.types) {
                if (MP4.types.hasOwnProperty(name)) {
                    MP4.types[name] = [name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)];
                }
            }

            var constants = MP4.constants = {};

            constants.FTYP = new Uint8Array([0x69, 0x73, 0x6F, 0x6D, // major_brand: isom		isom	MP4  Base Media v1 [IS0 14496-12:2003]	ISO	YES	video/mp4
            0x0, 0x0, 0x0, 0x1, // minor_version: 0x01
            0x69, 0x73, 0x6F, 0x6D, // isom
            0x61, 0x76, 0x63, 0x31 // avc1
            ]);

            constants.STSD_PREFIX = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags  version字段后会有一个entry count字段
            0x00, 0x00, 0x00, 0x01 // entry_count	根据entry的个数，每个entry会有type信息，如“vide”、“sund”等，根据type不同sample description会提供不同的信息，例如对于video track，会有“VisualSampleEntry”类型信息，对于audio track会有“AudioSampleEntry”类型信息。
            ]);

            constants.STTS = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags
            0x00, 0x00, 0x00, 0x00 // entry_count     0个索引
            ]);

            constants.STSC = constants.STCO = constants.STTS;

            constants.STSZ = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags
            0x00, 0x00, 0x00, 0x00, // sample_size
            0x00, 0x00, 0x00, 0x00 // sample_count
            ]);

            constants.HDLR_VIDEO = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags
            0x00, 0x00, 0x00, 0x00, // pre_defined
            0x76, 0x69, 0x64, 0x65, // handler_type: 'vide' 在media box中，该值为4个字符		“vide”— video track
            0x00, 0x00, 0x00, 0x00, // reserved: 3 * 4 bytes
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 保留位
            0x56, 0x69, 0x64, 0x65, 0x6F, 0x48, 0x61, 0x6E, 0x64, 0x6C, 0x65, 0x72, 0x00 // name: VideoHandler 长度不定		track type name，以‘\0’结尾的字符串
            ]);

            constants.HDLR_AUDIO = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags
            0x00, 0x00, 0x00, 0x00, // pre_defined
            0x73, 0x6F, 0x75, 0x6E, // handler_type: 'soun'在media box中，该值为4个字符		“soun”— audio track
            0x00, 0x00, 0x00, 0x00, // reserved: 3 * 4 bytes
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 保留位
            0x53, 0x6F, 0x75, 0x6E, 0x64, 0x48, 0x61, 0x6E, 0x64, 0x6C, 0x65, 0x72, 0x00 // name: SoundHandler 长度不定		track type name，以‘\0’结尾的字符串
            ]);

            constants.DREF = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags
            0x00, 0x00, 0x00, 0x01, // entry_count 1个url
            // url	box开始
            0x00, 0x00, 0x00, 0x0C, // entry_size
            0x75, 0x72, 0x6C, 0x20, // type 'url '
            0x00, 0x00, 0x00, 0x01 // version(0) + flags 当“url”或“urn”的box flag为1时，字符串均为空。
            ]);

            // Sound media header
            constants.SMHD = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags	box版本，0或1，一般为0。
            0x00, 0x00, 0x00, 0x00 // balance(2) + reserved(2) 立体声平衡，[8.8] 格式值，一般为0，-1.0表示全部左声道，1.0表示全部右声道+2位保留位
            ]);

            // video media header
            constants.VMHD = new Uint8Array([0x00, 0x00, 0x00, 0x01, // version(0) + flags
            0x00, 0x00, // graphicsmode: 2 bytes 视频合成模式，为0时拷贝原始图像，否则与opcolor进行合成   //理论上是4位啊  暂时保留
            0x00, 0x00, 0x00, 0x00, // opcolor: 3 * 2 bytes ｛red，green，blue｝
            0x00, 0x00]);
        }

        /**
         * 封装box
         */

    }, {
        key: 'box',
        value: function box(type) {
            var size = 8;
            var result = null;
            var datas = Array.prototype.slice.call(arguments, 1);
            var arrayCount = datas.length;

            for (var i = 0; i < arrayCount; i++) {
                size += datas[i].byteLength;
            }
            // box头部大小
            result = new Uint8Array(size);
            result[0] = size >>> 24 & 0xFF; // size
            result[1] = size >>> 16 & 0xFF;
            result[2] = size >>> 8 & 0xFF;
            result[3] = size & 0xFF;
            // 写入box的type
            result.set(type, 4); // type

            var offset = 8;
            for (var _i = 0; _i < arrayCount; _i++) {
                // data body
                result.set(datas[_i], offset);
                offset += datas[_i].byteLength;
            }

            return result;
        }

        // 创建ftyp&moov

    }, {
        key: 'generateInitSegment',
        value: function generateInitSegment(meta) {
            if (meta.constructor != Array) {
                meta = [meta];
            }
            var ftyp = MP4.box(MP4.types.ftyp, MP4.constants.FTYP);
            var moov = MP4.moov(meta);

            var result = new Uint8Array(ftyp.byteLength + moov.byteLength);
            result.set(ftyp, 0);
            result.set(moov, ftyp.byteLength);
            return result;
        }

        // Movie metadata box

    }, {
        key: 'moov',
        value: function moov(meta) {
            var mvhd = MP4.mvhd(meta[0].timescale, meta[0].duration); // /moov里面的第一个box
            var vtrak = MP4.trak(meta[0]);
            var atrak = void 0;
            if (meta.length > 1) {
                atrak = MP4.trak(meta[1]);
            }

            var mvex = MP4.mvex(meta);
            if (meta.length > 1) {
                return MP4.box(MP4.types.moov, mvhd, vtrak, atrak, mvex);
            } else {
                return MP4.box(MP4.types.moov, mvhd, vtrak, mvex);
            }
        }

        // Movie header box

    }, {
        key: 'mvhd',
        value: function mvhd(timescale, duration) {
            return MP4.box(MP4.types.mvhd, new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags     1位的box版本+3位flags   box版本，0或1，一般为0。（以下字节数均按version=0）
            0x00, 0x00, 0x00, 0x00, // creation_time    创建时间  （相对于UTC时间1904-01-01零点的秒数）
            0x00, 0x00, 0x00, 0x00, // modification_time   修改时间
            timescale >>> 24 & 0xFF, // timescale: 4 bytes		文件媒体在1秒时间内的刻度值，可以理解为1秒长度
            timescale >>> 16 & 0xFF, timescale >>> 8 & 0xFF, timescale & 0xFF, duration >>> 24 & 0xFF, // duration: 4 bytes	该track的时间长度，用duration和time scale值可以计算track时长，比如audio track的time scale = 8000, duration = 560128，时长为70.016，video track的time scale = 600, duration = 42000，时长为70
            duration >>> 16 & 0xFF, duration >>> 8 & 0xFF, duration & 0xFF, 0x00, 0x01, 0x00, 0x00, // Preferred rate: 1.0   推荐播放速率，高16位和低16位分别为小数点整数部分和小数部分，即[16.16] 格式，该值为1.0（0x00010000）表示正常前向播放
            0x01, 0x00, 0x00, 0x00, // PreferredVolume(1.0, 2bytes) + reserved(2bytes)	与rate类似，[8.8] 格式，1.0（0x0100）表示最大音量
            0x00, 0x00, 0x00, 0x00, // reserved: 4 + 4 bytes	保留位
            0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, // ----begin composition matrix----
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 视频变换矩阵   线性代数
            0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, // ----end composition matrix----
            0x00, 0x00, 0x00, 0x00, // ----begin pre_defined 6 * 4 bytes----
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // pre-defined 保留位
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ----end pre_defined 6 * 4 bytes----
            0xFF, 0xFF, 0xFF, 0xFF // next_track_ID 下一个track使用的id号
            ]));
        }

        // Track box

    }, {
        key: 'trak',
        value: function trak(meta) {
            return MP4.box(MP4.types.trak, MP4.tkhd(meta), MP4.mdia(meta));
        }

        // Track header box

    }, {
        key: 'tkhd',
        value: function tkhd(meta) {
            var trackId = meta.id,
                duration = meta.duration;
            var width = meta.presentWidth,
                height = meta.presentHeight;

            return MP4.box(MP4.types.tkhd, new Uint8Array([0x00, 0x00, 0x00, 0x07, // version(0) + flags 1位版本 box版本，0或1，一般为0。（以下字节数均按version=0）按位或操作结果值，预定义如下：
            // 0x000001 track_enabled，否则该track不被播放；
            // 0x000002 track_in_movie，表示该track在播放中被引用；
            // 0x000004 track_in_preview，表示该track在预览时被引用。
            // 一般该值为7，1+2+4 如果一个媒体所有track均未设置track_in_movie和track_in_preview，将被理解为所有track均设置了这两项；对于hint track，该值为0
            // hint track  这个特殊的track并不包含媒体数据，而是包含了一些将其他数据track打包成流媒体的指示信息。
            0x00, 0x00, 0x00, 0x00, // creation_time	创建时间（相对于UTC时间1904-01-01零点的秒数）
            0x00, 0x00, 0x00, 0x00, // modification_time	修改时间
            trackId >>> 24 & 0xFF, // track_ID: 4 bytes	id号，不能重复且不能为0
            trackId >>> 16 & 0xFF, trackId >>> 8 & 0xFF, trackId & 0xFF, 0x00, 0x00, 0x00, 0x00, // reserved: 4 bytes    保留位
            duration >>> 24 & 0xFF, // duration: 4 bytes  	track的时间长度
            duration >>> 16 & 0xFF, duration >>> 8 & 0xFF, duration & 0xFF, 0x00, 0x00, 0x00, 0x00, // reserved: 2 * 4 bytes    保留位
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // layer(2bytes) + alternate_group(2bytes)  视频层，默认为0，值小的在上层.track分组信息，默认为0表示该track未与其他track有群组关系
            0x00, 0x00, 0x00, 0x00, // volume(2bytes) + reserved(2bytes)    [8.8] 格式，如果为音频track，1.0（0x0100）表示最大音量；否则为0   +保留位
            0x00, 0x01, 0x00, 0x00, // ----begin composition matrix----
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, // 视频变换矩阵
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, // ----end composition matrix----
            width >>> 8 & 0xFF, // //宽度
            width & 0xFF, 0x00, 0x00, height >>> 8 & 0xFF, // 高度
            height & 0xFF, 0x00, 0x00]));
        }

        /**
         * “mdia”也是个container box，其子box的结构和种类还是比较复杂的。先来看一个“mdia”的实例结构树图。
         * 总体来说，“mdia”定义了track媒体类型以及sample数据，描述sample信息。一般“mdia”包含一个“mdhd”，
         * 一个“hdlr”和一个“minf”，其中“mdhd”为media header box，“hdlr”为handler reference box，
         * “minf”为media information box。
         *
         * mdia
         * 		mdhd
         * 		hdlr
         * 		minf
         * 			smhd
         * 			dinf
         * 				dref
         * 					url
         * 			stbl
         * 				stsd
         * 					mp4a
         * 						esds
         * 				stts
         * 				stsc
         * 				stsz
         * 				stco
         */

    }, {
        key: 'mdia',
        value: function mdia(meta) {
            return MP4.box(MP4.types.mdia, MP4.mdhd(meta), MP4.hdlr(meta), MP4.minf(meta));
        }

        // Media header box

    }, {
        key: 'mdhd',
        value: function mdhd(meta) {
            var timescale = meta.timescale;
            var duration = meta.duration;
            return MP4.box(MP4.types.mdhd, new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags // version(0) + flags		box版本，0或1，一般为0。
            0x00, 0x00, 0x00, 0x00, // creation_time    创建时间
            0x00, 0x00, 0x00, 0x00, // modification_time修改时间
            timescale >>> 24 & 0xFF, // timescale: 4 bytes    文件媒体在1秒时间内的刻度值，可以理解为1秒长度
            timescale >>> 16 & 0xFF, timescale >>> 8 & 0xFF, timescale & 0xFF, duration >>> 24 & 0xFF, // duration: 4 bytes  track的时间长度
            duration >>> 16 & 0xFF, duration >>> 8 & 0xFF, duration & 0xFF, 0x55, 0xC4, // language: und (undetermined) 媒体语言码。最高位为0，后面15位为3个字符（见ISO 639-2/T标准中定义）
            0x00, 0x00 // pre_defined = 0
            ]));
        }

        // Media handler reference box

    }, {
        key: 'hdlr',
        value: function hdlr(meta) {
            var data = null;
            if (meta.type === 'audio') {
                data = MP4.constants.HDLR_AUDIO;
            } else {
                data = MP4.constants.HDLR_VIDEO;
            }
            return MP4.box(MP4.types.hdlr, data);
        }

        /**
        * “minf”存储了解释track媒体数据的handler-specific信息，media handler用这些信息将媒体时间映射到媒体数据并进行处理。“minf”中的信息格式和内容与媒体类型以及解释媒体数据的media handler密切相关，其他media handler不知道如何解释这些信息。“minf”是一个container box，其实际内容由子box说明。
        一般情况下，“minf”包含一个header box，一个“dinf”和一个“stbl”，其中，header box根据track type（即media handler type）分为“vmhd”、“smhd”、“hmhd”和“nmhd”，“dinf”为data information box，“stbl”为sample table box。下面分别介绍。
        *
        */
        // Media infomation box

    }, {
        key: 'minf',
        value: function minf(meta) {
            // header box根据track type（即media handler type）分为“vmhd”、“smhd”、“hmhd”和“nmhd”
            var xmhd = null;
            if (meta.type === 'audio') {
                xmhd = MP4.box(MP4.types.smhd, MP4.constants.SMHD);
            } else {
                xmhd = MP4.box(MP4.types.vmhd, MP4.constants.VMHD);
            }
            return MP4.box(MP4.types.minf, xmhd, MP4.dinf(), MP4.stbl(meta));
        }

        /**
         * Data Information Box
         * “dinf”解释如何定位媒体信息，是一个container box。“dinf”一般包含一个“dref”，即data reference box；
         * “dref”下会包含若干个“url”或“urn”，这些box组成一个表，用来定位track数据。
         * 简单的说，track可以被分成若干段，每一段都可以根据“url”或“urn”指向的地址来获取数据，
         * sample描述中会用这些片段的序号将这些片段组成一个完整的track。
         * 一般情况下，当数据被完全包含在文件中时，“url”或“urn”中的定位字符串是空的。
         */

    }, {
        key: 'dinf',
        value: function dinf() {
            var result = MP4.box(MP4.types.dinf, MP4.box(MP4.types.dref, MP4.constants.DREF));
            return result;
        }

        /**
        * Sample Table Box（stbl）
        	*	“stbl”几乎是普通的MP4文件中最复杂的一个box了，首先需要回忆一下sample的概念。
        * 	sample是媒体数据存储的单位，存储在media的chunk中，chunk和sample的长度均可互不相同，如下图所示。
        “stbl”是一个container box，其子box包括：sample description box（stsd）、
        * time to sample box（stts）、sample size box（stsz或stz2）、
        * sample to chunk box（stsc）、chunk offset box（stco或co64）、
        * composition time to sample box（ctts）、sync sample box（stss）
        * stsd”必不可少，且至少包含一个条目，该box包含了data reference box进行sample数据检索的信息。
        * 没有“stsd”就无法计算media sample的存储位置。“stsd”包含了编码的信息，其存储的信息随媒体类型不同而不同。
        * 			stbl
        * 				stsd
        * 					avc1
        * 						avcC
        * 				stts
        * 				stsc
        * 				stsz
        * 				stco
        */

    }, {
        key: 'stbl',
        value: function stbl(meta) {
            var result = MP4.box(MP4.types.stbl, // type: stbl
            MP4.stsd(meta), // Sample Description Table
            MP4.box(MP4.types.stts, MP4.constants.STTS), // Time-To-Sample    因为stts的entry count 为0
            // 所以没有关键帧index 的stss
            // 也没有CTTS box CTTS是记录偏移量
            MP4.box(MP4.types.stsc, MP4.constants.STSC), // Sample-To-Chunk
            MP4.box(MP4.types.stsz, MP4.constants.STSZ), // Sample size
            MP4.box(MP4.types.stco, MP4.constants.STCO) // Chunk offset
            );
            return result;
        }

        /**
        * Sample Description Box（stsd）
        		box header和version字段后会有一个entry count字段，
        * 			根据entry的个数，每个entry会有type信息，如“vide”、“sund”等，
        * 		根据type不同sample description会提供不同的信息，例如对于video track，
        * 会有“VisualSampleEntry”类型信息，对于audio track会有“AudioSampleEntry”类型信息。
        * * 				stsd
        * 					mp4a
        * 						esds
        *
        *
        *
        *
        * 		 4 bytes - length in total
        	 4 bytes - 4 char code of sample description table (stsd)
        	 4 bytes - version & flags
        	 4 bytes - number of sample entries (num_sample_entries)
        		 [
        		    4 bytes - length of sample entry (len_sample_entry)
        		    4 bytes - 4 char code of sample entry
        		    ('len_sample_entry' - 8) bytes of data
        		 ] (repeated 'num_sample_entries' times)
        	(4 bytes - optional 0x00000000 as end of box marker )
        */

    }, {
        key: 'stsd',
        value: function stsd(meta) {
            if (meta.type === 'audio') {
                return MP4.box(MP4.types.stsd, MP4.constants.STSD_PREFIX, MP4.mp4a(meta));
            } else {
                return MP4.box(MP4.types.stsd, MP4.constants.STSD_PREFIX, MP4.avc1(meta));
            }
        }
    }, {
        key: 'mp4a',
        value: function mp4a(meta) {
            var channelCount = meta.channelCount;
            var sampleRate = meta.audioSampleRate;

            var data = new Uint8Array([0x00, 0x00, 0x00, 0x00, // reserved(4) 6个字节，设置为0；
            0x00, 0x00, 0x00, 0x01, // reserved(2) + data_reference_index(2)
            0x00, 0x00, 0x00, 0x00, // reserved: 2 * 4 bytes 保留位
            0x00, 0x00, 0x00, 0x00, 0x00, channelCount, // channelCount(2) 单声道还是双声道
            0x00, 0x10, // sampleSize(2)
            0x00, 0x00, 0x00, 0x00, // reserved(4) 4字节保留位
            sampleRate >>> 8 & 0xFF, // Audio sample rate 显然要右移16位才有意义	template unsigned int(32) samplerate = {timescale of media}<<16;
            sampleRate & 0xFF, 0x00, 0x00]);

            return MP4.box(MP4.types.mp4a, data, MP4.esds(meta));
        }
    }, {
        key: 'esds',
        value: function esds(meta) {
            var config = meta.config;
            var configSize = config.length;
            var data = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version 0 + flags

            0x03, // descriptor_type    MP4ESDescrTag
            0x17 + configSize, // length3
            0x00, 0x01, // es_id
            0x00, // stream_priority

            0x04, // descriptor_type    MP4DecConfigDescrTag
            0x0F + configSize, // length
            0x40, // codec: mpeg4_audio
            /**
             *当objectTypeIndication为0x40时，为MPEG-4 Audio（MPEG-4 Audio generally is thought of as AAC
             * but there is a whole framework of audio codecs that can Go in MPEG-4 Audio including AAC, BSAC, ALS, CELP,
             * and something called MP3On4），如果想更细分format为aac还是mp3，
             * 可以读取MP4DecSpecificDescr层data[0]的前五位
             */
            0x15, // stream_type: Audio
            0x00, 0x00, 0x00, // buffer_size
            0x00, 0x00, 0x00, 0x00, // maxBitrate
            0x00, 0x00, 0x00, 0x00, // avgBitrate

            0x05 // descriptor_type MP4DecSpecificDescrTag
            ].concat([configSize]).concat(config).concat([0x06, 0x01, 0x02 // GASpecificConfig
            ]));
            return MP4.box(MP4.types.esds, data);
        }

        /**
         * 改版
         *stsd下的avc1视频解析
         */

    }, {
        key: 'avc1',
        value: function avc1(meta) {
            var avcc = meta.avcc;
            var width = meta.codecWidth,
                height = meta.codecHeight;

            var data = new Uint8Array([0x00, 0x00, 0x00, 0x00, // // reserved(4)    6个 保留位	Reserved：6个字节，设置为0；
            0x00, 0x00, 0x00, 0x01, // reserved(2) + {{{{data_reference_index(2)  数据引用索引}}}}
            0x00, 0x00, 0x00, 0x00, // pre_defined(2) + reserved(2)
            0x00, 0x00, 0x00, 0x00, // pre_defined: 3 * 4 bytes  3*4个字节的保留位
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, width >>> 8 & 0xFF, // width: 2 bytes
            width & 0xFF, height >>> 8 & 0xFF, // height: 2 bytes
            height & 0xFF, 0x00, 0x48, 0x00, 0x00, // horizresolution: 4 bytes 常数
            0x00, 0x48, 0x00, 0x00, // vertresolution: 4 bytes 常数
            0x00, 0x00, 0x00, 0x00, // reserved: 4 bytes 保留位
            0x00, 0x01, // frame_count
            // frame_count表明多少帧压缩视频存储在每个样本。默认是1,每样一帧;它可能超过1每个样本的多个帧数
            0x04, //	strlen compressorname: 32 bytes			String[32]
            // 32个8 bit    第一个8bit表示长度,剩下31个8bit表示内容
            0x67, 0x31, 0x31, 0x31, // compressorname: 32 bytes    翻译过来是g111
            0x00, 0x00, 0x00, 0x00, //
            0x00, 0x00, 0x00, 0x00, //
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x18, // depth 颜色深度
            0xFF, 0xFF // pre_defined = -1
            ]);
            return MP4.box(MP4.types.avc1, data, MP4.box(MP4.types.avcC, avcc));
        }

        // Movie Extends box

    }, {
        key: 'mvex',
        value: function mvex(meta) {
            if (meta.length > 1) {
                return MP4.box(MP4.types.mvex, MP4.trex(meta[0]), MP4.trex(meta[1]));
            } else {
                return MP4.box(MP4.types.mvex, MP4.trex(meta[0]));
            }
        }

        // Track Extends box

    }, {
        key: 'trex',
        value: function trex(meta) {
            var trackId = meta.id;
            var data = new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) + flags
            trackId >>> 24 & 0xFF, // track_ID
            trackId >>> 16 & 0xFF, trackId >>> 8 & 0xFF, trackId & 0xFF, 0x00, 0x00, 0x00, 0x01, // default_sample_description_index
            0x00, 0x00, 0x00, 0x00, // default_sample_duration
            0x00, 0x00, 0x00, 0x00, // default_sample_size
            0x00, 0x01, 0x00, 0x01 // default_sample_flags
            ]);
            // if (meta.type !== 'video') {
            //     data[data.length - 1] = 0x00;
            // }
            return MP4.box(MP4.types.trex, data);
        }

        // Movie fragment box

    }, {
        key: 'moof',
        value: function moof(track, baseMediaDecodeTime) {
            return MP4.box(MP4.types.moof, MP4.mfhd(track.sequenceNumber), MP4.traf(track, baseMediaDecodeTime));
        }
    }, {
        key: 'mfhd',
        value: function mfhd(sequenceNumber) {
            var data = new Uint8Array([0x00, 0x00, 0x00, 0x00, sequenceNumber >>> 24 & 0xFF, // sequence_number: int32
            sequenceNumber >>> 16 & 0xFF, sequenceNumber >>> 8 & 0xFF, sequenceNumber & 0xFF]);
            return MP4.box(MP4.types.mfhd, data);
        }

        // Track fragment box

    }, {
        key: 'traf',
        value: function traf(track, baseMediaDecodeTime) {
            var trackId = track.id;

            // Track fragment header box
            var tfhd = MP4.box(MP4.types.tfhd, new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) & flags
            trackId >>> 24 & 0xFF, // track_ID
            trackId >>> 16 & 0xFF, trackId >>> 8 & 0xFF, trackId & 0xFF]));
            // Track Fragment Decode Time
            var tfdt = MP4.box(MP4.types.tfdt, new Uint8Array([0x00, 0x00, 0x00, 0x00, // version(0) & flags
            baseMediaDecodeTime >>> 24 & 0xFF, // baseMediaDecodeTime: int32
            baseMediaDecodeTime >>> 16 & 0xFF, baseMediaDecodeTime >>> 8 & 0xFF, baseMediaDecodeTime & 0xFF]));
            var sdtp = MP4.sdtp(track);
            var trun = MP4.trun(track, sdtp.byteLength + 16 + 16 + 8 + 16 + 8 + 8);

            return MP4.box(MP4.types.traf, tfhd, tfdt, trun, sdtp);
        }

        // Sample Dependency Type box

    }, {
        key: 'sdtp',
        value: function sdtp(track) {
            var samples = track.samples || [];
            var sampleCount = samples.length;
            var data = new Uint8Array(4 + sampleCount);
            // 0~4 bytes: version(0) & flags
            for (var i = 0; i < sampleCount; i++) {
                var flags = samples[i].flags;
                data[i + 4] = flags.isLeading << 6 | // is_leading: 2 (bit)
                flags.dependsOn << 4 // sample_depends_on
                | flags.isDependedOn << 2 // sample_is_depended_on
                | flags.hasRedundancy; // sample_has_redundancy
            }
            return MP4.box(MP4.types.sdtp, data);
        }

        // Track fragment run box

    }, {
        key: 'trun',
        value: function trun(track, offset) {
            var samples = track.samples || [];
            var sampleCount = samples.length;
            var dataSize = 12 + 16 * sampleCount;
            var data = new Uint8Array(dataSize);
            offset += 8 + dataSize;

            data.set([0x00, 0x00, 0x0F, 0x01, // version(0) & flags
            sampleCount >>> 24 & 0xFF, // sample_count
            sampleCount >>> 16 & 0xFF, sampleCount >>> 8 & 0xFF, sampleCount & 0xFF, offset >>> 24 & 0xFF, // data_offset
            offset >>> 16 & 0xFF, offset >>> 8 & 0xFF, offset & 0xFF], 0);

            for (var i = 0; i < sampleCount; i++) {

                var duration = samples[i].duration;

                var size = samples[i].size;
                var flags = samples[i].flags;
                var cts = samples[i].cts;
                data.set([duration >>> 24 & 0xFF, // sample_duration
                duration >>> 16 & 0xFF, duration >>> 8 & 0xFF, duration & 0xFF, size >>> 24 & 0xFF, // sample_size
                size >>> 16 & 0xFF, size >>> 8 & 0xFF, size & 0xFF, flags.isLeading << 2 | flags.dependsOn, // sample_flags
                flags.isDependedOn << 6 | flags.hasRedundancy << 4 | flags.isNonSync, 0x00, 0x00, // sample_degradation_priority
                cts >>> 24 & 0xFF, // sample_composition_time_offset
                cts >>> 16 & 0xFF, cts >>> 8 & 0xFF, cts & 0xFF], 12 + 16 * i);
            }
            return MP4.box(MP4.types.trun, data);
        }
    }, {
        key: 'mdat',
        value: function mdat(data) {
            return MP4.box(MP4.types.mdat, data);
        }
    }]);

    return MP4;
}();

MP4.init();

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * This file is modified from dailymotion's hls.js library (hls.js/src/helper/aac.js)
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
var AAC = function () {
    function AAC() {
        _classCallCheck(this, AAC);
    }

    _createClass(AAC, null, [{
        key: "getSilentFrame",
        value: function getSilentFrame(channelCount) {
            if (channelCount === 1) {
                return new Uint8Array([0x00, 0xc8, 0x00, 0x80, 0x23, 0x80]);
            } else if (channelCount === 2) {
                return new Uint8Array([0x21, 0x00, 0x49, 0x90, 0x02, 0x19, 0x00, 0x23, 0x80]);
            } else if (channelCount === 3) {
                return new Uint8Array([0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64, 0x00, 0x8e]);
            } else if (channelCount === 4) {
                return new Uint8Array([0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64, 0x00, 0x80, 0x2c, 0x80, 0x08, 0x02, 0x38]);
            } else if (channelCount === 5) {
                return new Uint8Array([0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64, 0x00, 0x82, 0x30, 0x04, 0x99, 0x00, 0x21, 0x90, 0x02, 0x38]);
            } else if (channelCount === 6) {
                return new Uint8Array([0x00, 0xc8, 0x00, 0x80, 0x20, 0x84, 0x01, 0x26, 0x40, 0x08, 0x64, 0x00, 0x82, 0x30, 0x04, 0x99, 0x00, 0x21, 0x90, 0x02, 0x00, 0xb2, 0x00, 0x20, 0x08, 0xe0]);
            }
            return null;
        }
    }]);

    return AAC;
}();

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
var Browser = {};

function detect() {
    // modified from jquery-browser-plugin

    var ua = self.navigator.userAgent.toLowerCase();

    var match = /(edge)\/([\w.]+)/.exec(ua) || /(opr)[\/]([\w.]+)/.exec(ua) || /(chrome)[ \/]([\w.]+)/.exec(ua) || /(iemobile)[\/]([\w.]+)/.exec(ua) || /(version)(applewebkit)[ \/]([\w.]+).*(safari)[ \/]([\w.]+)/.exec(ua) || /(webkit)[ \/]([\w.]+).*(version)[ \/]([\w.]+).*(safari)[ \/]([\w.]+)/.exec(ua) || /(webkit)[ \/]([\w.]+)/.exec(ua) || /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) || /(msie) ([\w.]+)/.exec(ua) || ua.indexOf('trident') >= 0 && /(rv)(?::| )([\w.]+)/.exec(ua) || ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) || [];

    var platform_match = /(ipad)/.exec(ua) || /(ipod)/.exec(ua) || /(windows phone)/.exec(ua) || /(iphone)/.exec(ua) || /(kindle)/.exec(ua) || /(android)/.exec(ua) || /(windows)/.exec(ua) || /(mac)/.exec(ua) || /(linux)/.exec(ua) || /(cros)/.exec(ua) || [];

    var matched = {
        browser: match[5] || match[3] || match[1] || '',
        version: match[2] || match[4] || '0',
        majorVersion: match[4] || match[2] || '0',
        platform: platform_match[0] || ''
    };

    var browser = {};
    if (matched.browser) {
        browser[matched.browser] = true;

        var versionArray = matched.majorVersion.split('.');
        browser.version = {
            major: parseInt(matched.majorVersion, 10),
            string: matched.version
        };
        if (versionArray.length > 1) {
            browser.version.minor = parseInt(versionArray[1], 10);
        }
        if (versionArray.length > 2) {
            browser.version.build = parseInt(versionArray[2], 10);
        }
    }

    if (matched.platform) {
        browser[matched.platform] = true;
    }

    if (browser.chrome || browser.opr || browser.safari) {
        browser.webkit = true;
    }

    // MSIE. IE11 has 'rv' identifer
    if (browser.rv || browser.iemobile) {
        if (browser.rv) {
            delete browser.rv;
        }
        var msie = 'msie';
        matched.browser = msie;
        browser[msie] = true;
    }

    // Microsoft Edge
    if (browser.edge) {
        delete browser.edge;
        var msedge = 'msedge';
        matched.browser = msedge;
        browser[msedge] = true;
    }

    // Opera 15+
    if (browser.opr) {
        var opera = 'opera';
        matched.browser = opera;
        browser[opera] = true;
    }

    // Stock android browsers are marked as Safari
    if (browser.safari && browser.android) {
        var android = 'android';
        matched.browser = android;
        browser[android] = true;
    }

    browser.name = matched.browser;
    browser.platform = matched.platform;

    for (var key in Browser) {
        if (Browser.hasOwnProperty(key)) {
            delete Browser[key];
        }
    }
    _Object$assign(Browser, browser);
}

detect();

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
// Represents an media sample (audio / video)
var SampleInfo = function SampleInfo(dts, pts, duration, originalDts, isSync) {
    _classCallCheck(this, SampleInfo);

    this.dts = dts;
    this.pts = pts;
    this.duration = duration;
    this.originalDts = originalDts;
    this.isSyncPoint = isSync;
    this.fileposition = null;
};

// Media Segment concept is defined in Media Source Extensions spec.
// Particularly in ISO BMFF format, an Media Segment contains a moof box followed by a mdat box.
var MediaSegmentInfo = function () {
    function MediaSegmentInfo() {
        _classCallCheck(this, MediaSegmentInfo);

        this.beginDts = 0;
        this.endDts = 0;
        this.beginPts = 0;
        this.endPts = 0;
        this.originalBeginDts = 0;
        this.originalEndDts = 0;
        this.syncPoints = []; // SampleInfo[n], for video IDR frames only
        this.firstSample = null; // SampleInfo
        this.lastSample = null; // SampleInfo
    }

    _createClass(MediaSegmentInfo, [{
        key: "appendSyncPoint",
        value: function appendSyncPoint(sampleInfo) {
            // also called Random Access Point
            sampleInfo.isSyncPoint = true;
            this.syncPoints.push(sampleInfo);
        }
    }]);

    return MediaSegmentInfo;
}();

// Ordered list for recording video IDR frames, sorted by originalDts
var IDRSampleList = function () {
    function IDRSampleList() {
        _classCallCheck(this, IDRSampleList);

        this._list = [];
    }

    _createClass(IDRSampleList, [{
        key: "clear",
        value: function clear() {
            this._list = [];
        }
    }, {
        key: "appendArray",
        value: function appendArray(syncPoints) {
            var list = this._list;

            if (syncPoints.length === 0) {
                return;
            }

            if (list.length > 0 && syncPoints[0].originalDts < list[list.length - 1].originalDts) {
                this.clear();
            }

            Array.prototype.push.apply(list, syncPoints);
        }
    }, {
        key: "getLastSyncPointBeforeDts",
        value: function getLastSyncPointBeforeDts(dts) {
            if (this._list.length == 0) {
                return null;
            }

            var list = this._list;
            var idx = 0;
            var last = list.length - 1;
            var mid = 0;
            var lbound = 0;
            var ubound = last;

            if (dts < list[0].dts) {
                idx = 0;
                lbound = ubound + 1;
            }

            while (lbound <= ubound) {
                mid = lbound + Math.floor((ubound - lbound) / 2);
                if (mid === last || dts >= list[mid].dts && dts < list[mid + 1].dts) {
                    idx = mid;
                    break;
                } else if (list[mid].dts < dts) {
                    lbound = mid + 1;
                } else {
                    ubound = mid - 1;
                }
            }
            return this._list[idx];
        }
    }]);

    return IDRSampleList;
}();

// Data structure for recording information of media segments in single track.
var MediaSegmentInfoList = function () {
    function MediaSegmentInfoList(type) {
        _classCallCheck(this, MediaSegmentInfoList);

        this._type = type;
        this._list = [];
        this._lastAppendLocation = -1; // cached last insert location
    }

    _createClass(MediaSegmentInfoList, [{
        key: "isEmpty",
        value: function isEmpty() {
            return this._list.length === 0;
        }
    }, {
        key: "clear",
        value: function clear() {
            this._list = [];
            this._lastAppendLocation = -1;
        }
    }, {
        key: "_searchNearestSegmentBefore",
        value: function _searchNearestSegmentBefore(originalBeginDts) {
            var list = this._list;
            if (list.length === 0) {
                return -2;
            }
            var last = list.length - 1;
            var mid = 0;
            var lbound = 0;
            var ubound = last;

            var idx = 0;

            if (originalBeginDts < list[0].originalBeginDts) {
                idx = -1;
                return idx;
            }

            while (lbound <= ubound) {
                mid = lbound + Math.floor((ubound - lbound) / 2);
                if (mid === last || originalBeginDts > list[mid].lastSample.originalDts && originalBeginDts < list[mid + 1].originalBeginDts) {
                    idx = mid;
                    break;
                } else if (list[mid].originalBeginDts < originalBeginDts) {
                    lbound = mid + 1;
                } else {
                    ubound = mid - 1;
                }
            }
            return idx;
        }
    }, {
        key: "_searchNearestSegmentAfter",
        value: function _searchNearestSegmentAfter(originalBeginDts) {
            return this._searchNearestSegmentBefore(originalBeginDts) + 1;
        }
    }, {
        key: "append",
        value: function append(mediaSegmentInfo) {
            var list = this._list;
            var msi = mediaSegmentInfo;
            var lastAppendIdx = this._lastAppendLocation;
            var insertIdx = 0;

            if (lastAppendIdx !== -1 && lastAppendIdx < list.length && msi.originalBeginDts >= list[lastAppendIdx].lastSample.originalDts && (lastAppendIdx === list.length - 1 || lastAppendIdx < list.length - 1 && msi.originalBeginDts < list[lastAppendIdx + 1].originalBeginDts)) {
                insertIdx = lastAppendIdx + 1; // use cached location idx
            } else {
                if (list.length > 0) {
                    insertIdx = this._searchNearestSegmentBefore(msi.originalBeginDts) + 1;
                }
            }

            this._lastAppendLocation = insertIdx;
            this._list.splice(insertIdx, 0, msi);
        }
    }, {
        key: "getLastSegmentBefore",
        value: function getLastSegmentBefore(originalBeginDts) {
            var idx = this._searchNearestSegmentBefore(originalBeginDts);
            if (idx >= 0) {
                return this._list[idx];
            } else {
                // -1
                return null;
            }
        }
    }, {
        key: "getLastSampleBefore",
        value: function getLastSampleBefore(originalBeginDts) {
            var segment = this.getLastSegmentBefore(originalBeginDts);
            if (segment != null) {
                return segment.lastSample;
            } else {
                return null;
            }
        }
    }, {
        key: "getLastSyncPointBefore",
        value: function getLastSyncPointBefore(originalBeginDts) {
            var segmentIdx = this._searchNearestSegmentBefore(originalBeginDts);
            var syncPoints = this._list[segmentIdx].syncPoints;
            while (syncPoints.length === 0 && segmentIdx > 0) {
                segmentIdx--;
                syncPoints = this._list[segmentIdx].syncPoints;
            }
            if (syncPoints.length > 0) {
                return syncPoints[syncPoints.length - 1];
            } else {
                return null;
            }
        }
    }, {
        key: "type",
        get: function get() {
            return this._type;
        }
    }, {
        key: "length",
        get: function get() {
            return this._list.length;
        }
    }]);

    return MediaSegmentInfoList;
}();

/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable */
// Fragmented mp4 remuxer

var MP4Remuxer = function () {
    function MP4Remuxer(config) {
        _classCallCheck(this, MP4Remuxer);

        this.TAG = this.constructor.name;

        this._config = config;
        this._isLive = config.isLive === true;

        this._dtsBase = -1;
        this._dtsBaseInited = false;
        this._audioDtsBase = Infinity;
        this._videoDtsBase = Infinity;
        this._audioNextDts = undefined;
        this._videoNextDts = undefined;

        this._audioMeta = null;
        this._videoMeta = null;

        this._audioSegmentInfoList = new MediaSegmentInfoList('audio');
        this._videoSegmentInfoList = new MediaSegmentInfoList('video');

        this._onInitSegment = null;
        this._onMediaSegment = null;

        // Workaround for chrome < 50: Always force first sample as a Random Access Point in media segment
        // see https://bugs.chromium.org/p/chromium/issues/detail?id=229412
        this._forceFirstIDR = !!(Browser.chrome && (Browser.version.major < 50 || Browser.version.major === 50 && Browser.version.build < 2661));

        // Workaround for IE11/Edge: Fill silent aac frame after keyframe-seeking
        // Make audio beginDts equals with video beginDts, in order to fix seek freeze
        this._fillSilentAfterSeek = Browser.msedge || Browser.msie;
    }

    _createClass(MP4Remuxer, [{
        key: 'destroy',
        value: function destroy() {
            this._dtsBase = -1;
            this._dtsBaseInited = false;
            this._audioMeta = null;
            this._videoMeta = null;
            this._audioSegmentInfoList.clear();
            this._audioSegmentInfoList = null;
            this._videoSegmentInfoList.clear();
            this._videoSegmentInfoList = null;
            this._onInitSegment = null;
            this._onMediaSegment = null;
        }
    }, {
        key: 'bindDataSource',
        value: function bindDataSource(producer) {
            producer.onDataAvailable = this.remux.bind(this);
            producer.onTrackMetadata = this._onTrackMetadataReceived.bind(this);
            return this;
        }

        /* prototype: function onInitSegment(type: string, initSegment: ArrayBuffer): void
           InitSegment: {
               type: string,
               data: ArrayBuffer,
               codec: string,
               container: string
           }
        */

    }, {
        key: 'insertDiscontinuity',
        value: function insertDiscontinuity() {
            this._audioNextDts = this._videoNextDts = undefined;
        }
    }, {
        key: 'seek',
        value: function seek(originalDts) {
            this._videoSegmentInfoList.clear();
            this._audioSegmentInfoList.clear();
        }
    }, {
        key: 'remux',
        value: function remux(audioTrack, videoTrack) {
            if (!this._onMediaSegment) {
                throw new Error$1('MP4Remuxer: onMediaSegment callback must be specificed!');
            }
            if (!this._dtsBaseInited) {
                this._calculateDtsBase(audioTrack, videoTrack);
            }
            this._remuxVideo(videoTrack);
            this._remuxAudio(audioTrack);
        }
    }, {
        key: '_onTrackMetadataReceived',
        value: function _onTrackMetadataReceived(type, metadata) {
            var metabox = null;

            if (type === 'audio') {
                this._audioMeta = metadata;
                metabox = MP4.generateInitSegment(metadata);
                console.log('msg+audio', metadata);
            } else if (type === 'video') {
                this._videoMeta = metadata;
                metabox = MP4.generateInitSegment(metadata);
                console.log('msg+video', metadata);
            } else {
                return;
            }

            // dispatch metabox (Initialization Segment)
            if (!this._onInitSegment) {
                throw new Error$1('MP4Remuxer: onInitSegment callback must be specified!');
            }
            this._onInitSegment(type, {
                type: type,
                data: metabox.buffer,
                codec: metadata.codec,
                container: type + '/mp4'
            });
        }
    }, {
        key: '_calculateDtsBase',
        value: function _calculateDtsBase(audioTrack, videoTrack) {
            if (this._dtsBaseInited) {
                return;
            }

            if (audioTrack.samples && audioTrack.samples.length) {
                this._audioDtsBase = audioTrack.samples[0].dts;
            }
            if (videoTrack.samples && videoTrack.samples.length) {
                this._videoDtsBase = videoTrack.samples[0].dts;
            }

            this._dtsBase = Math.min(this._audioDtsBase, this._videoDtsBase);
            this._dtsBaseInited = true;
        }
    }, {
        key: '_remuxAudio',
        value: function _remuxAudio(audioTrack) {
            var track = audioTrack;
            var samples = track.samples;
            var dtsCorrection = void 0;
            var firstDts = -1,
                lastDts = -1,
                lastPts = -1;

            var remuxSilentFrame = false;
            var silentFrameDuration = -1;

            if (!samples || samples.length === 0) {
                return;
            }

            var bytes = 8 + track.length;
            var mdatbox = new Uint8Array(bytes);
            mdatbox[0] = bytes >>> 24 & 0xFF;
            mdatbox[1] = bytes >>> 16 & 0xFF;
            mdatbox[2] = bytes >>> 8 & 0xFF;
            mdatbox[3] = bytes & 0xFF;

            mdatbox.set(MP4.types.mdat, 4);

            var offset = 8; // size + type
            var mp4Samples = [];

            while (samples.length) {
                var aacSample = samples.shift();
                var unit = aacSample.unit;
                var originalDts = aacSample.dts - this._dtsBase;

                if (dtsCorrection == undefined) {
                    if (this._audioNextDts == undefined) {
                        if (this._audioSegmentInfoList.isEmpty()) {
                            dtsCorrection = 0;
                            if (this._fillSilentAfterSeek && !this._videoSegmentInfoList.isEmpty()) {
                                remuxSilentFrame = true;
                            }
                        } else {
                            var lastSample = this._audioSegmentInfoList.getLastSampleBefore(originalDts);
                            if (lastSample != null) {
                                var distance = originalDts - (lastSample.originalDts + lastSample.duration);
                                if (distance <= 3) {
                                    distance = 0;
                                }
                                var expectedDts = lastSample.dts + lastSample.duration + distance;
                                dtsCorrection = originalDts - expectedDts;
                            } else {
                                // lastSample == null
                                dtsCorrection = 0;
                            }
                        }
                    } else {
                        dtsCorrection = originalDts - this._audioNextDts;
                    }
                }

                var dts = originalDts - dtsCorrection;
                if (remuxSilentFrame) {
                    // align audio segment beginDts to match with current video segment's beginDts
                    var videoSegment = this._videoSegmentInfoList.getLastSegmentBefore(originalDts);
                    if (videoSegment != null && videoSegment.beginDts < dts) {
                        silentFrameDuration = dts - videoSegment.beginDts;
                        dts = videoSegment.beginDts;
                    } else {
                        remuxSilentFrame = false;
                    }
                }
                if (firstDts === -1) {
                    firstDts = dts;
                }

                if (remuxSilentFrame) {
                    remuxSilentFrame = false;
                    samples.unshift(aacSample);

                    var frame = this._generateSilentAudio(dts, silentFrameDuration);
                    if (frame == null) {
                        continue;
                    }
                    var _mp4Sample = frame.mp4Sample;
                    var _unit = frame.unit;

                    mp4Samples.push(_mp4Sample);

                    // re-allocate mdatbox buffer with new size, to fit with this silent frame
                    bytes += _unit.byteLength;
                    mdatbox = new Uint8Array(bytes);
                    mdatbox[0] = bytes >>> 24 & 0xFF;
                    mdatbox[1] = bytes >>> 16 & 0xFF;
                    mdatbox[2] = bytes >>> 8 & 0xFF;
                    mdatbox[3] = bytes & 0xFF;
                    mdatbox.set(MP4.types.mdat, 4);

                    // fill data now
                    mdatbox.set(_unit, offset);
                    offset += _unit.byteLength;
                    continue;
                }

                var sampleDuration = 0;

                if (samples.length >= 1) {
                    var nextDts = samples[0].dts - this._dtsBase - dtsCorrection;
                    sampleDuration = nextDts - dts;
                } else {
                    if (mp4Samples.length >= 1) {
                        // use second last sample duration
                        sampleDuration = mp4Samples[mp4Samples.length - 1].duration;
                    } else {
                        // the only one sample, use reference sample duration
                        sampleDuration = this._audioMeta.refSampleDuration;
                    }
                }

                var mp4Sample = {
                    dts: dts,
                    pts: dts,
                    cts: 0,
                    size: unit.byteLength,
                    duration: sampleDuration,
                    originalDts: originalDts,
                    flags: {
                        isLeading: 0,
                        dependsOn: 1,
                        isDependedOn: 0,
                        hasRedundancy: 0
                    }
                };
                mp4Samples.push(mp4Sample);
                mdatbox.set(unit, offset);
                offset += unit.byteLength;
            }
            var latest = mp4Samples[mp4Samples.length - 1];
            lastDts = latest.dts + latest.duration;
            this._audioNextDts = lastDts;

            // fill media segment info & add to info list
            var info = new MediaSegmentInfo();
            info.beginDts = firstDts;
            info.endDts = lastDts;
            info.beginPts = firstDts;
            info.endPts = lastDts;
            info.originalBeginDts = mp4Samples[0].originalDts;
            info.originalEndDts = latest.originalDts + latest.duration;
            info.firstSample = new SampleInfo(mp4Samples[0].dts, mp4Samples[0].pts, mp4Samples[0].duration, mp4Samples[0].originalDts, false);
            info.lastSample = new SampleInfo(latest.dts, latest.pts, latest.duration, latest.originalDts, false);
            if (!this._isLive) {
                this._audioSegmentInfoList.append(info);
            }

            track.samples = mp4Samples;
            track.sequenceNumber += track.addcoefficient;

            var moofbox = MP4.moof(track, firstDts);
            track.samples = [];
            track.length = 0;

            this._onMediaSegment('audio', {
                type: 'audio',
                data: this._mergeBoxes(moofbox, mdatbox).buffer,
                sampleCount: mp4Samples.length,
                info: info
            });
        }
    }, {
        key: '_generateSilentAudio',
        value: function _generateSilentAudio(dts, frameDuration) {
            console.log(this.TAG, 'GenerateSilentAudio: dts = ' + dts + ', duration = ' + frameDuration);

            var unit = AAC.getSilentFrame(this._audioMeta.channelCount);
            if (unit == null) {
                console.log(this.TAG, 'Cannot generate silent aac frame for channelCount = ' + this._audioMeta.channelCount);
                return null;
            }

            var mp4Sample = {
                dts: dts,
                pts: dts,
                cts: 0,
                size: unit.byteLength,
                duration: frameDuration,
                originalDts: dts,
                flags: {
                    isLeading: 0,
                    dependsOn: 1,
                    isDependedOn: 0,
                    hasRedundancy: 0
                }
            };

            return {
                unit: unit,
                mp4Sample: mp4Sample
            };
        }
    }, {
        key: '_remuxVideo',
        value: function _remuxVideo(videoTrack) {
            var track = videoTrack;
            var samples = track.samples;
            var dtsCorrection = void 0;
            var firstDts = -1,
                lastDts = -1;
            var firstPts = -1,
                lastPts = -1;

            if (!samples || samples.length === 0) {
                return;
            }

            var bytes = 8 + videoTrack.length;
            var mdatbox = new Uint8Array(bytes);
            mdatbox[0] = bytes >>> 24 & 0xFF;
            mdatbox[1] = bytes >>> 16 & 0xFF;
            mdatbox[2] = bytes >>> 8 & 0xFF;
            mdatbox[3] = bytes & 0xFF;
            mdatbox.set(MP4.types.mdat, 4);

            var offset = 8;
            var mp4Samples = [];
            var info = new MediaSegmentInfo();

            while (samples.length) {
                var avcSample = samples.shift();
                var keyframe = avcSample.isKeyframe;
                var originalDts = avcSample.dts - this._dtsBase;

                if (dtsCorrection == undefined) {
                    if (this._videoNextDts == undefined) {
                        if (this._videoSegmentInfoList.isEmpty()) {
                            dtsCorrection = 0;
                        } else {
                            var lastSample = this._videoSegmentInfoList.getLastSampleBefore(originalDts);
                            if (lastSample != null) {
                                var distance = originalDts - (lastSample.originalDts + lastSample.duration);
                                if (distance <= 3) {
                                    distance = 0;
                                }
                                var expectedDts = lastSample.dts + lastSample.duration + distance;
                                dtsCorrection = originalDts - expectedDts;
                            } else {
                                // lastSample == null
                                dtsCorrection = 0;
                            }
                        }
                    } else {
                        dtsCorrection = originalDts - this._videoNextDts;
                    }
                }

                var dts = originalDts - dtsCorrection;
                var cts = avcSample.cts;
                var pts = dts + cts;

                if (firstDts === -1) {
                    firstDts = dts;
                    firstPts = pts;
                }

                // fill mdat box
                var sampleSize = 0;
                while (avcSample.units.length) {
                    var unit = avcSample.units.shift();
                    var data = unit.data;
                    mdatbox.set(data, offset);
                    offset += data.byteLength;
                    sampleSize += data.byteLength;
                }

                var sampleDuration = 0;

                if (samples.length >= 1) {
                    var nextDts = samples[0].dts - this._dtsBase - dtsCorrection;
                    sampleDuration = nextDts - dts;
                } else {
                    if (mp4Samples.length >= 1) {
                        // lastest sample, use second last duration
                        sampleDuration = mp4Samples[mp4Samples.length - 1].duration;
                    } else {
                        // the only one sample, use reference duration
                        sampleDuration = this._videoMeta.refSampleDuration;
                    }
                }

                if (keyframe) {
                    var syncPoint = new SampleInfo(dts, pts, sampleDuration, avcSample.dts, true);
                    syncPoint.fileposition = avcSample.fileposition;
                    info.appendSyncPoint(syncPoint);
                }

                var mp4Sample = {
                    dts: dts,
                    pts: pts,
                    cts: cts,
                    size: sampleSize,
                    isKeyframe: keyframe,
                    duration: sampleDuration,
                    originalDts: originalDts,
                    flags: {
                        isLeading: 0,
                        dependsOn: keyframe ? 2 : 1,
                        isDependedOn: keyframe ? 1 : 0,
                        hasRedundancy: 0,
                        isNonSync: keyframe ? 0 : 1
                    }
                };

                mp4Samples.push(mp4Sample);
            }
            var latest = mp4Samples[mp4Samples.length - 1];
            lastDts = latest.dts + latest.duration;
            lastPts = latest.pts + latest.duration;
            this._videoNextDts = lastDts;

            // fill media segment info & add to info list
            info.beginDts = firstDts;
            info.endDts = lastDts;
            info.beginPts = firstPts;
            info.endPts = lastPts;
            info.originalBeginDts = mp4Samples[0].originalDts;
            info.originalEndDts = latest.originalDts + latest.duration;
            info.firstSample = new SampleInfo(mp4Samples[0].dts, mp4Samples[0].pts, mp4Samples[0].duration, mp4Samples[0].originalDts, mp4Samples[0].isKeyframe);
            info.lastSample = new SampleInfo(latest.dts, latest.pts, latest.duration, latest.originalDts, latest.isKeyframe);
            if (!this._isLive) {
                this._videoSegmentInfoList.append(info);
            }

            track.samples = mp4Samples;
            track.sequenceNumber += track.addcoefficient;

            // workaround for chrome < 50: force first sample as a random access point
            // see https://bugs.chromium.org/p/chromium/issues/detail?id=229412
            if (this._forceFirstIDR) {
                var flags = mp4Samples[0].flags;
                flags.dependsOn = 2;
                flags.isNonSync = 0;
            }

            var moofbox = MP4.moof(track, firstDts);
            track.samples = [];
            track.length = 0;

            this._onMediaSegment('video', {
                type: 'video',
                data: this._mergeBoxes(moofbox, mdatbox).buffer,
                sampleCount: mp4Samples.length,
                info: info
            });
        }
    }, {
        key: '_mergeBoxes',
        value: function _mergeBoxes(moof, mdat) {
            var result = new Uint8Array(moof.byteLength + mdat.byteLength);
            result.set(moof, 0);
            result.set(mdat, moof.byteLength);
            return result;
        }
    }, {
        key: 'onInitSegment',
        get: function get() {
            return this._onInitSegment;
        },
        set: function set(callback) {
            this._onInitSegment = callback;
        }

        /* prototype: function onMediaSegment(type: string, mediaSegment: MediaSegment): void
           MediaSegment: {
               type: string,
               data: ArrayBuffer,
               sampleCount: int32
               info: MediaSegmentInfo
           }
        */

    }, {
        key: 'onMediaSegment',
        get: function get() {
            return this._onMediaSegment;
        },
        set: function set(callback) {
            this._onMediaSegment = callback;
        }
    }]);

    return MP4Remuxer;
}();

/* eslint-disable */
var flv2fmp4 = function (_CustEvent) {
    _inherits(flv2fmp4, _CustEvent);

    /**
     * Creates an instance of flv2fmp4.
     * config 里面有_isLive属性,是否是直播
     * @param {any} config
     *
     * @memberof flv2fmp4
     */
    function flv2fmp4(config) {
        _classCallCheck(this, flv2fmp4);

        var _this = _possibleConstructorReturn(this, (flv2fmp4.__proto__ || _Object$getPrototypeOf(flv2fmp4)).call(this));

        _this._config = { _isLive: false };
        _this._config = _Object$assign(_this._config, config);

        // 外部方法赋值
        _this.onInitSegment = null;
        _this.onMediaSegment = null;
        _this.onMediaInfo = null;
        _this.seekCallBack = null;

        // 内部使用
        _this.loadmetadata = false;
        _this.ftyp_moov = null;
        _this.metaSuccRun = false;
        _this.metas = [];
        _this.parseChunk = null;
        _this.hasVideo = false;
        _this.hasAudio = false;
        _this._error = null;
        // 临时记录seek时间
        _this._pendingResolveSeekPoint = -1;

        // 临时记录flv数据起始时间
        _this._tempBaseTime = 0;

        // 处理flv数据入口
        _this.setflvBase = _this.setflvBasefrist;

        tagdemux._onTrackMetadata = _this.Metadata.bind(_this);
        tagdemux._onMediaInfo = _this.metaSucc.bind(_this);
        tagdemux._onDataAvailable = _this.onDataAvailable.bind(_this);
        tagdemux._onError = _this.error.bind(_this);
        _this.m4mof = new MP4Remuxer(_this._config);
        _this.m4mof.onMediaSegment = _this.onMdiaSegment.bind(_this);
        return _this;
    }

    _createClass(flv2fmp4, [{
        key: 'seek',
        value: function seek(baseTime) {
            this.setflvBase = this.setflvBasefrist;
            if (baseTime == undefined || baseTime == 0) {
                baseTime = 0;
                this._pendingResolveSeekPoint = -1;
            }
            if (this._tempBaseTime != baseTime) {
                this._tempBaseTime = baseTime;
                tagdemux._timestampBase = baseTime;
                this.m4mof.seek(baseTime);
                this.m4mof.insertDiscontinuity();
                this._pendingResolveSeekPoint = baseTime;
            }
        }

        /**
         * 不要主动调用这个接口!!!!!!!!!!!!!!!!!!!!!!!!!!!!
         * 第一次接受数据,和seek时候接受数据入口,
         *
         * @param {any} arraybuff
         * @param {any} baseTime
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'setflvBasefrist',
        value: function setflvBasefrist(arraybuff, baseTime) {
            var offset = 0;
            try {
                offset = flvparse.setFlv(new Uint8Array(arraybuff));
            } catch (error) {
                this.error(error);
            }
            if (flvparse.arrTag[0].type != 18) {
                this.error(new Error$1('without metadata tag'));
            }
            if (flvparse.arrTag.length > 0) {
                tagdemux.hasAudio = this.hasAudio = flvparse._hasAudio;
                tagdemux.hasVideo = this.hasVideo = flvparse._hasVideo;
                if (this._tempBaseTime != 0 && this._tempBaseTime == flvparse.arrTag[0].getTime()) {
                    tagdemux._timestampBase = 0;
                }
                try {
                    tagdemux.moofTag(flvparse.arrTag);
                } catch (error) {
                    this.error(error);
                }

                this.setflvBase = this.setflvBaseUsually;
            }

            return offset;
        }

        /**
         * 不要主动调用这个接口!!!!!!!!!!!!!!!!!!!!!!!!!!!!
         * 后续接受数据接口
         * @param {any} arraybuff
         * @param {any} baseTime
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'setflvBaseUsually',
        value: function setflvBaseUsually(arraybuff, baseTime) {
            var offset = 0;
            try {
                offset = flvparse.setFlv(new Uint8Array(arraybuff));
            } catch (error) {
                this.error(error);
            }
            if (flvparse.arrTag.length > 0) {
                try {
                    tagdemux.moofTag(flvparse.arrTag);
                } catch (error) {
                    this.error(error);
                }
            }

            return offset;
        }

        /**
         * 不要主动调用这个接口!!!!!!!!!!!!!!!!!!!!!!!!!!!!
         * moof回调
         *
         * @param {any} track
         * @param {any} value
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'onMdiaSegment',
        value: function onMdiaSegment(track, value) {

            if (this.onMediaSegment) {
                this.onMediaSegment(new Uint8Array(value.data));
            }
            if (this._pendingResolveSeekPoint != -1 && track == 'video') {
                var seekpoint = this._pendingResolveSeekPoint;
                this._pendingResolveSeekPoint = -1;
                if (this.seekCallBack) {
                    this.seekCallBack(seekpoint);
                }
            }
        }

        /**
         *
         * 音频和视频的初始化tag
         *
         * @param {any} type
         * @param {any} meta
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'Metadata',
        value: function Metadata(type, meta) {
            switch (type) {
                case 'video':
                    this.metas.push(meta);
                    this.m4mof._videoMeta = meta;
                    if (this.hasVideo && !this.hasAudio) {
                        this.metaSucc();
                        return;
                    }
                    break;
                case 'audio':
                    this.metas.push(meta);
                    this.m4mof._audioMeta = meta;
                    if (!this.hasVideo && this.hasAudio) {
                        this.metaSucc();
                        return;
                    }
                    break;
            }
            if (this.hasVideo && this.hasAudio && this.metas.length > 1) {
                this.metaSucc();
            }
        }

        /**
         * metadata解读成功后触发及第一个视频tag和第一个音频tag
         *
         * @param {any} mi
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'metaSucc',
        value: function metaSucc(mi) {
            if (this.onMediaInfo) {
                this.onMediaInfo(mi || tagdemux._mediaInfo, { hasAudio: this.hasAudio, hasVideo: this.hasVideo });
            }
            // 获取ftyp和moov
            if (this.metas.length == 0) {
                this.metaSuccRun = true;
                return;
            }
            if (mi) return;
            this.ftyp_moov = MP4.generateInitSegment(this.metas);
            if (this.onInitSegment && this.loadmetadata == false) {

                this.onInitSegment(this.ftyp_moov);
                this.loadmetadata = true;
            }
        }
    }, {
        key: 'onDataAvailable',
        value: function onDataAvailable(audiotrack, videotrack) {
            try {
                this.m4mof.remux(audiotrack, videotrack);
            } catch (e) {
                this.error(e);
            }
        }

        /**
         * 传入flv的二进制数据
         * 统一入口
         * @param {any} arraybuff
         * @param {any} baseTime flv数据开始时间
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'setflv',
        value: function setflv(arraybuff, baseTime) {
            return this.setflvBase(arraybuff, baseTime);
        }

        /**
         *
         * 本地调试代码,不用理会
         * @param {any} arraybuff
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'setflvloc',
        value: function setflvloc(arraybuff) {
            var offset = flvparse.setFlv(new Uint8Array(arraybuff));

            if (flvparse.arrTag.length > 0) {
                return flvparse.arrTag;
            }
        }

        /**
         * 
         *  异常抛出处理
         * @param {any} e 
         * @memberof flv2fmp4
         */

    }, {
        key: 'error',
        value: function error(e) {
            if (this._error) {
                this._error(e);
            }
        }
    }]);

    return flv2fmp4;
}(CustEvent);

/**
 * 封装的对外类,有些方法不想对外暴露,所以封装这么一个类
 *
 * @class foreign
 */


var foreign = function (_CustEvent2) {
    _inherits(foreign, _CustEvent2);

    function foreign(config) {
        _classCallCheck(this, foreign);

        var _this2 = _possibleConstructorReturn(this, (foreign.__proto__ || _Object$getPrototypeOf(foreign)).call(this));

        _this2.f2m = new flv2fmp4(config);
        _this2.f2m._error = _this2.error;
        // 外部方法赋值
        _this2._onInitSegment = null;
        _this2._onMediaSegment = null;
        _this2._onMediaInfo = null;
        _this2._seekCallBack = null;
        return _this2;
    }

    _createClass(foreign, [{
        key: 'error',
        value: function error(e) {
            this.emit('error', e.type);
        }
        /**
         *
         * 跳转
         * @param {any} basetime  跳转时间
         *
         * @memberof foreign
         */

    }, {
        key: 'seek',
        value: function seek(basetime) {
            this.f2m.seek(basetime);
        }

        /**
         * 传入flv的二进制数据
         * 统一入口
         * @param {any} arraybuff
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'setflv',
        value: function setflv(arraybuff) {
            return this.f2m.setflv(arraybuff, 0);
        }

        /**
         *
         * 本地调试代码,不用理会
         * @param {any} arraybuff
         * @returns
         *
         * @memberof flv2fmp4
         */

    }, {
        key: 'setflvloc',
        value: function setflvloc(arraybuff) {
            return this.f2m.setflvloc(arraybuff);
        }

        /**
         * 赋值初始化seg接受方法
         *
         *
         * @memberof foreign
         */

    }, {
        key: 'onInitSegment',
        set: function set(fun) {
            this._onInitSegment = fun;
            this.f2m.onInitSegment = fun;
        }

        /**
         * 赋值moof接受方法
         *
         *
         * @memberof foreign
         */

    }, {
        key: 'onMediaSegment',
        set: function set(fun) {
            this._onMediaSegment = fun;
            this.f2m.onMediaSegment = fun;
        }

        /**
         * 赋值metadata接受方法
         *
         *
         * @memberof foreign
         */

    }, {
        key: 'onMediaInfo',
        set: function set(fun) {
            this._onMediaInfo = fun;
            this.f2m.onMediaInfo = fun;
        }

        /**
         * 赋值是否跳转回调接受方法
         *
         *
         * @memberof foreign
         */

    }, {
        key: 'seekCallBack',
        set: function set(fun) {
            this._seekCallBack = fun;
            this.f2m.seekCallBack = fun;
        }
    }]);

    return foreign;
}(CustEvent);

// const F2M = require('chimee-flv2fmp4');
/**
 * Transmuxer 控制层
 * @class Transmuxer
 * @param {mediaSource} mediaSource
 * @param {object} config
 */

var Transmuxer = function (_CustEvent) {
  _inherits(Transmuxer, _CustEvent);

  function Transmuxer(mediaSource, config) {
    _classCallCheck(this, Transmuxer);

    var _this = _possibleConstructorReturn(this, (Transmuxer.__proto__ || _Object$getPrototypeOf(Transmuxer)).call(this));

    _this.config = {};
    _this.tag = 'transmuxer';
    _this.loader = null;
    _this.CPU = null;
    _this.keyframePoint = false;
    _this.w = null;
    _Object$assign(_this.config, config);
    if (_this.config.webWorker) {
      _this.w = work('./transmuxer-worker');
      _this.w.postMessage({ cmd: 'init' });
      _this.w.addEventListener('message', function (e) {
        _this.parseCallback(e.data);
      });
    }
    return _this;
  }
  /**
  * instance ioloader
  */


  _createClass(Transmuxer, [{
    key: 'loadSource',
    value: function loadSource() {
      if (this.config.webWorker) {
        this.w.postMessage({ cmd: 'loadSource' });
        // this.loader.arrivalDataCallback = this.arrivalDataCallbackWorker.bind(this);
      } else {
        this.loader = new Ioloader(this.config);
        this.loader.arrivalDataCallback = this.arrivalDataCallback.bind(this);
        this.loader.open();
      }
    }
    /**
     * data arrive to webworker
     */
    // arrivalDataCallbackWorker (data, byteStart, keyframePoint) {
    //   if(keyframePoint) {
    //     this.w.postMessage({cmd: 'seek', source: data});
    //   }
    //   this.w.postMessage({cmd: 'pipe', source: data});
    //   return;
    // }
    /**
    * loader data callback
    *  @param {arraybuffer} 数据
    *  @param {number} 开始的起点
    *  @param {keyframePoint} 关键帧点
    */

  }, {
    key: 'arrivalDataCallback',
    value: function arrivalDataCallback(data, byteStart, keyframePoint) {
      var consumed = 0;
      if (!this.CPU) {
        this.CPU = new foreign();
        this.CPU.onInitSegment = this.onRemuxerInitSegmentArrival.bind(this);
        this.CPU.onMediaSegment = this.onRemuxerMediaSegmentArrival.bind(this);
        this.CPU.onError = this.onCPUError.bind(this);
        this.CPU.onMediaInfo = this.onMediaInfo.bind(this);
        this.CPU.on('error', function (handle) {
          this.emit('f2m', handle.data);
        });
      }
      if (keyframePoint) {
        this.keyframePoint = true;
        this.CPU.seek(keyframePoint);
      }
      consumed = this.CPU.setflv(data);
      return consumed;
    }

    /**
     * loader data callback
     *  @param {arraybuffer} 数据
     */

  }, {
    key: 'parseCallback',
    value: function parseCallback(data) {
      switch (data.cmd) {
        case 'pipeCallback':
          data.source;
          break;
        case 'mediaSegmentInit':
          this.emit('mediaSegmentInit', data.source);
          break;
        case 'mediaSegment':
          this.emit('mediaSegment', data.source);
          break;
        case 'mediainfo':
          this.emit('mediainfo', data.source);
          break;
      }
    }

    /**
     * Demux error
     *  @param {string} 类型
     *  @param {string} 信息
     */

  }, {
    key: 'onDemuxError',
    value: function onDemuxError(type, info) {
      Log.error(this.tag, 'DemuxError: type = ' + type + ', info = ' + info);
      this.emit('DemuxError', type, info);
    }

    /**
     * Demux mediaInfo
     *  @param {object} 视频头信息
     */

  }, {
    key: 'onMediaInfo',
    value: function onMediaInfo(mediaInfo) {
      this.mediaInfo = mediaInfo;
      this.emit('mediaInfo', mediaInfo);
    }

    /**
     * remuxer init segment arrival
     *  @param {arraybuffer} 视频数据
     */

  }, {
    key: 'onRemuxerInitSegmentArrival',
    value: function onRemuxerInitSegmentArrival(data) {
      this.emit('mediaSegmentInit', data);
    }

    /**
     * remuxer  segment arrival
     *  @param {arraybuffer} 视频数据
     */

  }, {
    key: 'onRemuxerMediaSegmentArrival',
    value: function onRemuxerMediaSegmentArrival(data) {
      this.emit('mediaSegment', data);
    }

    /**
     * cpu error
     *  @param {object} 错误信息
     */

  }, {
    key: 'onCPUError',
    value: function onCPUError(handle) {
      this.emit('ERROR', handle.data);
    }

    /**
     * get video mediaInfo
     */

  }, {
    key: 'getMediaInfo',
    value: function getMediaInfo() {
      return this.mediaInfo;
    }

    /**
    * stop loader
    */

  }, {
    key: 'pause',
    value: function pause() {
      this.loader.pause();
    }

    /**
     * resume loader
     */

  }, {
    key: 'resume',
    value: function resume() {
      this.loader.resume();
    }
    /**
    * flv can seek
    */

  }, {
    key: 'isSeekable',
    value: function isSeekable() {
      return this.mediaInfo.hasKeyframesIndex;
    }
    /**
     * video seek
     * @param {object} 关键帧集合
     */

  }, {
    key: 'seek',
    value: function seek(keyframe) {
      if (!this.isSeekable()) {
        this.emit('ERROR', '这个flv视频不支持seek');
        return false;
      }
      this.loader = new Ioloader(this.config);
      this.loader.arrivalDataCallback = this.arrivalDataCallback.bind(this);
      this.loader.seek(keyframe.keyframePoint, false, keyframe.keyframetime);
    }

    /**
     * refresh
     */

  }, {
    key: 'refresh',
    value: function refresh() {
      this.pause();
      this.loader = new Ioloader(this.config);
      this.loader.arrivalDataCallback = this.arrivalDataCallback.bind(this);
      this.loader.open();
    }

    /**
     * destroy
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      this.loader.destroy();
      this.loader = null;
      this.CPU = null;
    }

    /**
     * get nearlest keyframe
     */

  }, {
    key: 'getNearlestKeyframe',
    value: function getNearlestKeyframe(times) {
      if (this.mediaInfo && this.mediaInfo.keyframesIndex) {
        var keyframesList = this.mediaInfo.keyframesIndex.times;
        var keyframesPositions = this.mediaInfo.keyframesIndex.filepositions;
        var binarySearch = function binarySearch(list, val) {
          var length = list.length;
          var index = Math.floor(length / 2);
          if (length === 1) {
            var position = keyframesList.indexOf(list[0]);
            return {
              keyframetime: list[0],
              keyframePoint: keyframesPositions[position]
            };
          } else if (list[index] > val) {
            return binarySearch(list.slice(0, index), val);
          } else if (list[index] < val) {
            return binarySearch(list.slice(index), val);
          } else {
            var _position = keyframesList.indexOf(list[0]);
            return {
              keyframetime: list[0],
              keyframePoint: keyframesPositions[_position]
            };
          }
        };
        return binarySearch(keyframesList, times);
      } else {
        return 0;
      }
    }
  }]);

  return Transmuxer;
}(CustEvent);

var defaultConfig = {
  isLive: false, // 是否是直播
  box: 'flv', // 容器
  prestrain: 30, // 总是seek 到关键帧
  alwaysSeekKeyframe: true, // 总是seek 到关键帧
  lazyLoadMaxDuration: 2 * 60, //懒加载 最大播放长度
  lazyLoadRecoverDuration: 30, //懒加载还有多少长度 重启加载功能
  lockInternalProperty: false, //锁定原生的选项
  debug: true, //是否开启debug模式
  webWorker: false, // 是否开启webworker
  autoCleanupSourceBuffer: true, //是否自动清除 sourcebuffer
  autoCleanupMaxBackwardDuration: 30, //清除sourcebuffer最大时间
  autoCleanupMinBackwardDuration: 30 //清除sourcebuffer最小时间
};

/**
 * flv 控制层
 * @export
 * @class mp4
 */

var Flv = function (_CustEvent) {
  _inherits(Flv, _CustEvent);

  _createClass(Flv, null, [{
    key: 'isSupport',
    value: function isSupport() {

      var parser = new UAParser();
      var info = parser.getBrowser();
      if (info.name === 'Safari' && parseInt(info.major) < 10) {
        return false;
      }

      if (window.MediaSource && window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.640020,mp4a.40.2"')) {
        return true;
      } else {
        return false;
      }
    }
  }, {
    key: 'version',
    get: function get() {
      return '1.1.2';
    }
  }]);

  function Flv(videodom, config) {
    _classCallCheck(this, Flv);

    var _this2 = _possibleConstructorReturn(this, (Flv.__proto__ || _Object$getPrototypeOf(Flv)).call(this));

    _this2.tag = 'FLV-player';
    _this2.video = videodom;
    _this2.box = 'flv';
    _this2.timer = null;
    _this2.config = deepAssign({}, defaultConfig, config);
    _this2.requestSetTime = false;
    _this2.bindEvents();
    _this2.attachMedia();
    return _this2;
  }
  /**
   * 内部控制能否设置currentTime
   */


  _createClass(Flv, [{
    key: 'internalPropertyHandle',
    value: function internalPropertyHandle() {
      if (!_Object$getOwnPropertyDescriptor) {
        return;
      }
      var _this = this;
      var time = _Object$getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');

      Object.defineProperty(this.video, 'currentTime', {
        get: function get() {
          return time.get.call(_this.video);
        },
        set: function set(t) {
          if (!_this.currentTimeLock) {
            throw new Error('can not set currentTime by youself');
          } else {
            return time.set.call(_this.video, t);
          }
        }
      });
    }

    /**
     * 绑定事件
     */

  }, {
    key: 'bindEvents',
    value: function bindEvents() {
      var _this3 = this;

      if (this.video) {
        this.video.addEventListener('canplay', function () {
          if (_this3.config.isLive) {
            _this3.video.play();
          }
          if (_this3.config.lockInternalProperty) {
            _this3.internalPropertyHandle();
          }
        });
      }
    }

    /**
     * 建立 mediaSource
     */

  }, {
    key: 'attachMedia',
    value: function attachMedia() {
      var _this4 = this;

      this.mediaSource = new MSEController(this.video, this.config);

      this.mediaSource.on('source_open', function () {});
      this.mediaSource.on('bufferFull', function () {
        _this4.pauseTransmuxer();
      });
      this.mediaSource.on('updateend', function () {
        _this4.onmseUpdateEnd();
      });
    }

    /**
     * load
     * @param {string} video url
     */

  }, {
    key: 'load',
    value: function load(src) {
      var _this5 = this;

      if (src) {
        this.config.src = src;
      }

      this.transmuxer = new Transmuxer(this.mediaSource, this.config);

      this.transmuxer.on('mediaSegment', function (handle) {
        _this5.mediaSource.emit('mediaSegment', handle.data);
      });
      this.transmuxer.on('mediaSegmentInit', function (handle) {
        _this5.mediaSource.emit('mediaSegmentInit', handle.data);
      });

      this.transmuxer.on('error', function (handle) {
        _this5.emit('error', handle.data);
      });
      this.transmuxer.on('mediaInfo', function (mediaInfo) {
        if (!_this5.mediaInfo) {
          _this5.mediaInfo = mediaInfo;
          _this5.emit('mediaInfo', mediaInfo);
          _this5.mediaSource.init(mediaInfo);
          _this5.video.src = URL.createObjectURL(_this5.mediaSource.mediaSource);
          _this5.video.addEventListener('seeking', throttle(_this5._seek.bind(_this5), 200, { leading: false }));
        }
      });
      this.transmuxer.loadSource();
    }

    /**
     * seek in buffered
     * @param {number} seek time
     */

  }, {
    key: 'isTimeinBuffered',
    value: function isTimeinBuffered(seconds) {
      var buffered = this.video.buffered;
      for (var i = 0; i < buffered.length; i++) {
        var from = buffered.start(i);
        var to = buffered.end(i);
        if (seconds >= from && seconds < to) {
          return true;
        }
      }
      return false;
    }

    /**
     * get current buffer end
     */

  }, {
    key: 'getCurrentBufferEnd',
    value: function getCurrentBufferEnd() {
      var buffered = this.video.buffered;
      var currentTime = this.video.currentTime;
      var currentRangeEnd = 0;

      for (var i = 0; i < buffered.length; i++) {
        var start = buffered.start(i);
        var end = buffered.end(i);
        if (start <= currentTime && currentTime < end) {
          currentRangeEnd = end;
          return currentRangeEnd;
        }
      }
    }
    /**
     * _seek
     * @param {number} seek time
     */

  }, {
    key: '_seek',
    value: function _seek(seconds) {
      this.currentTimeLock = true;

      var currentTime = seconds && !isNaN(seconds) ? seconds : this.video.currentTime;

      if (this.requestSetTime) {
        this.requestSetTime = false;
        this.currentTimeLock = false;
        return;
      }
      // const buffered = this.video.buffered;
      if (this.isTimeinBuffered(currentTime)) {
        if (this.config.alwaysSeekKeyframe) {
          var nearlestkeyframe = this.transmuxer.getNearlestKeyframe(Math.floor(currentTime * 1000));
          if (nearlestkeyframe) {
            this.requestSetTime = true;
            this.video.currentTime = nearlestkeyframe.keyframetime / 1000;
          }
        }
      } else {
        Log.verbose(this.tag, 'do seek');
        this.transmuxer.pause();
        var _nearlestkeyframe = this.transmuxer.getNearlestKeyframe(Math.floor(currentTime * 1000));
        currentTime = _nearlestkeyframe.keyframetime / 1000;
        this.transmuxer.seek(_nearlestkeyframe);
        this.mediaSource.seek(currentTime);
        this.requestSetTime = true;
        this.video.currentTime = currentTime;
        window.clearInterval(this.timer);
        this.timer = null;
      }
      this.currentTimeLock = false;
      return currentTime;
    }

    /**
     * mediaSource updateend
     */

  }, {
    key: 'onmseUpdateEnd',
    value: function onmseUpdateEnd() {
      var _this6 = this;

      setTimeout(function () {
        if (_this6.config.isLive) {
          return;
        }
        var currentBufferEnd = _this6.getCurrentBufferEnd();
        var currentTime = _this6.video.currentTime;
        if (currentBufferEnd >= currentTime + _this6.config.lazyLoadMaxDuration && _this6.timer === null) {
          Log.verbose(_this6.tag, 'Maximum buffering duration exceeded, suspend transmuxing task');
          _this6.pauseTransmuxer();
        }
      }, 10);
    }

    /**
     * 心跳
     */

  }, {
    key: 'heartbeat',
    value: function heartbeat() {
      var currentTime = this.video.currentTime;
      var buffered = this.video.buffered;

      var needResume = false;

      for (var i = 0; i < buffered.length; i++) {
        var from = buffered.start(i);
        var to = buffered.end(i);
        if (currentTime >= from && currentTime < to) {
          if (currentTime >= to - this.config.lazyLoadRecoverDuration) {
            needResume = true;
          }
          break;
        }
      }

      if (needResume) {
        window.clearInterval(this.timer);
        this.timer = null;
        Log.verbose(this.tag, 'Continue loading from paused position');
        this.transmuxer.resume();
      }
    }

    /**
     * 暂停 transmuxer
     */

  }, {
    key: 'pauseTransmuxer',
    value: function pauseTransmuxer() {
      this.transmuxer.pause();
      if (!this.timer) {
        this.timer = setInterval(this.heartbeat.bind(this), 1000);
      }
    }
  }, {
    key: 'resume',
    value: function resume() {}

    /**
     * destroy
     */

  }, {
    key: 'destroy',
    value: function destroy() {
      if (this.video) {
        this.video.src = '';
        this.video.removeAttribute('src');
        this.transmuxer.destroy();
        this.transmuxer = null;
        this.mediaSource.destroy();
        this.mediaSource = null;
      }
    }
  }, {
    key: 'seek',
    value: function seek(seconds) {
      return this._seek(seconds);
    }
  }, {
    key: 'play',
    value: function play() {
      return this.video.play();
    }
  }, {
    key: 'pause',
    value: function pause() {
      return this.video.pause();
    }
  }, {
    key: 'refresh',
    value: function refresh() {
      this.transmuxer.refresh();
    }
  }]);

  return Flv;
}(CustEvent);

export default Flv;
