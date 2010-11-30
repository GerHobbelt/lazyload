/*jslint browser: true, eqeqeq: true, bitwise: true, newcap: true, immed: true, regexp: false */

/**
 * LazyLoad makes it easy and painless to lazily load one or more external
 * JavaScript or CSS files on demand either during or after the rendering of
 * a web page.
 *
 * Supported browsers include Firefox 2+, IE6+, Safari 3+ (including Mobile
 * Safari), Google Chrome, and Opera 9+. Other browsers may or may not work and
 * are not officially supported.
 *
 * Visit http://github.com/rgrove/lazyload/ or
 * http://wonko.com/post/lazyload-200-released for more info.
 *
 * Copyright (c) 2010 Ryan Grove <ryan@wonko.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *   * Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *   * Redistributions in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *   * Neither the name of this project nor the names of its contributors may be
 *     used to endorse or promote products derived from this software without
 *     specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * @module lazyload
 * @class LazyLoad
 * @static
 * @version 2.0.1.dev (git)
 */

LazyLoad = (function () {

  // -- Private Variables ------------------------------------------------------

  // Reference to the browser's document object.
  var d = document,

  // User agent and feature test information.
  env,

  // Reference to the <head> element.
  head,

  // Requests currently in progress, if any.
  pending = {},

  // Number of times we've polled to check whether a pending stylesheet has
  // finished loading in WebKit. If this gets too high, we're probably stalled.
  pollCount = 0,

  // Queued requests.
  queue = {css: [], js: []},

  // Reference to the browser's list of stylesheets.
  styleSheets = d.styleSheets;

  // -- Private Methods --------------------------------------------------------

  /**
   * Creates and returns an HTML element with the specified name and attributes.
   *
   * @method createNode
   * @param {String} name element name
   * @param {Object} attrs name/value mapping of element attributes
   * @return {HTMLElement}
   * @private
   */
  function createNode(name, attrs) {
    var node = d.createElement(name), attr;

    for (attr in attrs) {
      if (attrs.hasOwnProperty(attr)) {
        node.setAttribute(attr, attrs[attr]);
      }
    }

    return node;
  }

  /**
   * Called when the current pending resource of the specified type has finished
   * loading. Executes the associated callback (if any) and loads the next
   * resource in the queue.
   *
   * @method finish
   * @param {String} type resource type ('css' or 'js')
   * @private
   */
  function finish(type) {
    var p = pending[type],
        callback,
        urls;

    if (p) {
      callback = p.callback;
      urls     = p.urls;

      urls.shift();
      pollCount = 0;
      //alert('finish! ' + type + ' ' + urls.length + ' ' + callback);

      // execute the callback for each finished JS load (progress bars 'n stuff can use this!)
      if (callback) {
          callback.call(p.context, p.obj, {
                base_context: this,
                // JS or CSS: which queue entry just finished loading
                type: type,
				// Because most often you'd want to know if you're the very last one in there, or not:
				todo_count: queue[type].length,
                // Reference to the browser's document object.
                document: document,
                // Reference to the <head> element.
                htmlhead: head,
                // Requests currently in progress, if any.
                pending_set: pending,
                // Number of times we've polled to check whether a pending stylesheet has
                // finished loading in WebKit. If this gets too high, we're probably stalled.
                finish_pollcount: pollCount,
                // Queued requests.
                load_queue: queue,
                // Reference to the browser's list of stylesheets.
                page_stylesheets: styleSheets,
                // User environment information.
                user_environment: env
              });
        }

      // If this is the last of the pending URLs, execute the callback and
      // start the next request in the queue (if any).
      if (!urls.length) {
        pending[type] = null;

        if (queue[type].length) {
          load(type);
        }
      }
    }
  }

  /**
   * Populates the <code>env</code> variable with user agent and feature test
   * information. Uses a paraphrased version of the YUI user agent detection
   * code.
   *
   * @method getEnv
   * @private
   */
  function getEnv() {
    // No need to run again if already populated.
    if (env) {
      return;
    }

    var nua = navigator.userAgent,
        pF  = parseFloat,
        m;

    env = {
      // True if this browser supports disabling async mode on dynamically
      // created script nodes. This feature should show up in FF4. See
      // http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order
      async: d.createElement('script').async === true,

      // Browser version numbers sniffed from the user agent string.
      gecko : 0,
      ie    : 0,
      opera : 0,
      webkit: 0
    };

    m = nua.match(/AppleWebKit\/(\S*)/);

    if (m && m[1]) {
      env.webkit = pF(m[1]);
    } else {
      m = nua.match(/MSIE\s([^;]*)/);

      if (m && m[1]) {
        env.ie = pF(m[1]);
      } else if ((/Gecko\/(\S*)/).test(nua)) {
        env.gecko = 1;

        m = nua.match(/rv:([^\s\)]*)/);

        if (m && m[1]) {
          env.gecko = pF(m[1]);
        }
      } else if ((m = nua.match(/Opera\/(\S*)/))) { // assignment
        env.opera = pF(m[1]);
      }
    }
  }

  /**
   * Loads the specified resources, or the next resource of the specified type
   * in the queue if no resources are specified. If a resource of the specified
   * type is already being loaded, the new request will be queued until the
   * first request has been finished.
   *
   * When an array of resource URLs is specified, those URLs will be loaded in
   * parallel if it is possible to do so while preserving execution order. All
   * browsers support parallel loading of CSS, but only Firefox <4 and Opera
   * support parallel loading of scripts. In Firefox 4+ and other browsers,
   * scripts will be queued and loaded one at a time to ensure correct execution
   * order.
   *
   * @method load
   * @param {String} type resource type ('css' or 'js')
   * @param {String|Array} urls (optional) URL or array of URLs to load
   * @param {Function} callback (optional) callback function to execute when the
   *   resource is loaded
   * @param {Object} obj (optional) object to pass to the callback function
   * @param {Object} context (optional) if provided, the callback function will
   *   be executed in this object's context
   * @private
   */
  function load(type, urls, callback, obj, context) {
    var _finish = function () { finish(type); },
        isCSS   = type === 'css',
        i, len, node, p, pendingUrls, url;

    getEnv();

    if (urls) {
      // Cast urls to an Array.
      urls = Object.prototype.toString.call(urls) === '[object Array]' ?
          urls : [urls];

      // Create a request object for each URL. If multiple URLs are specified,
      // the callback will only be executed after all URLs have been loaded.
      //
      // Sadly, Firefox <4 and Opera are the only browsers capable of loading
      // scripts in parallel while preserving execution order. In all other
      // browsers, scripts must be loaded sequentially. Firefox 4 beta 7
      // intentionally removed execution order preservation.
      //
      // There's a chance that FF4 final will add support for manually
      // specifying whether execution order should be preserved. LazyLoad tests
      // for that capability and will use it if it's present; otherwise, it will
      // fall back to the slower, safer synchronous mode.
      //
      // All browsers respect CSS specificity based on the order of the link
      // elements in the DOM, regardless of the order in which the stylesheets
      // are actually downloaded.
      if (isCSS || (env.gecko && (env.async || env.gecko < 2)) || env.opera) {
        queue[type].push({
          urls    : [].concat(urls), // concat ensures copy by value
          callback: callback,
          obj     : obj,
          context : context
        });
      } else {
        for (i = 0, len = urls.length; i < len; ++i) {
          queue[type].push({
            urls    : [urls[i]],
            // callback: i === len - 1 ? callback : null, // callback is only added to the last URL
            callback: callback,
            obj     : obj,
            context : context
          });
        }
      }
    }

    // If a previous load request of this type is currently in progress, we'll
    // wait our turn. Otherwise, grab the next item in the queue.
    if (pending[type] || !(p = pending[type] = queue[type].shift())) {
      return;
    }

    head        = head || d.head || d.getElementsByTagName('head')[0];
    pendingUrls = p.urls;

    for (i = 0, len = pendingUrls.length; i < len; ++i) {
      url = pendingUrls[i];

      if (isCSS) {
        node = createNode('link', {
          charset: 'utf-8',
          'class': 'lazyload',
          href   : url,
          rel    : 'stylesheet',
          type   : 'text/css'
        });
      } else {
        node = createNode('script', {
          charset: 'utf-8',
          'class': 'lazyload',
          src    : url
        });

        if (env.async) {
          node.async = false;
        }
      }

      if (env.ie) {
        node.onreadystatechange = function () {
          var readyState = this.readyState;

          if (readyState === 'loaded' || readyState === 'complete') {
            this.onreadystatechange = null;
            _finish();
          }
        };
      } else if (isCSS && (env.gecko || env.webkit)) {
        // Gecko and WebKit don't support the onload event on link nodes. In
        // WebKit, we can poll for changes to document.styleSheets to figure out
        // when stylesheets have loaded, but in Gecko we just have to finish
        // after a brief delay and hope for the best.
        if (env.webkit) {
          p.urls[i] = node.href; // resolve relative URLs (or polling won't work)
          poll();
        } else {
          setTimeout(_finish, 50 * len);
        }
      } else {
        node.onload = node.onerror = _finish;
      }

      head.appendChild(node);
    }
  }

  /**
   * Begins polling to determine when pending stylesheets have finished loading
   * in WebKit. Polling stops when all pending stylesheets have loaded.
   *
   * @method poll
   * @private
   */
  function poll() {
    var css = pending.css, i;

    if (!css) {
      return;
    }

    i = styleSheets.length;

    // Look for a stylesheet matching the pending URL.
    while (i && --i) {
      if (styleSheets[i].href === css.urls[0]) {
        finish('css');
        break;
      }
    }

    pollCount += 1;

    if (css) {
      if (pollCount < 200) {
        setTimeout(poll, 50);
      } else {
        // We've been polling for 10 seconds and nothing's happened, which may
        // indicate that the stylesheet has been removed from the document
        // before it had a chance to load. Stop polling and finish the pending
        // request to prevent blocking further requests.
        finish('css');
      }
    }
  }

  return {

    /**
     * Requests the specified CSS URL or URLs and executes the specified
     * callback (if any) when they have finished loading. If an array of URLs is
     * specified, the stylesheets will be loaded in parallel and the callback
     * will be executed after all stylesheets have finished loading.
     *
     * Currently, Firefox doesn't provide any way to reliably determine when a
     * stylesheet has finished loading. In Firefox, the callback will be
     * executed after a brief delay. For information on a manual technique you
     * can use to detect when CSS has actually finished loading in Firefox, see
     * http://wonko.com/post/how-to-prevent-yui-get-race-conditions (which
     * applies to LazyLoad as well, despite being originally written in in
     * reference to the YUI Get utility).
     *
     * @method css
     * @param {String|Array} urls CSS URL or array of CSS URLs to load
     * @param {Function} callback (optional) callback function to execute when
     *   the specified stylesheets are loaded
     * @param {Object} obj (optional) object to pass to the callback function
     * @param {Object} context (optional) if provided, the callback function
     *   will be executed in this object's context
     * @static
     */
    css: function (urls, callback, obj, context) {
      load('css', urls, callback, obj, context);
    },

    /**
     * Requests the specified JavaScript URL or URLs and executes the specified
     * callback (if any) when they have finished loading. If an array of URLs is
     * specified and the browser supports it, the scripts will be loaded in
     * parallel and the callback will be executed after all scripts have
     * finished loading.
     *
     * Currently, only Firefox <4 and Opera support parallel loading of scripts
     * while preserving execution order. In Firefox 4+ and other browsers,
     * scripts will be queued and loaded one at a time to ensure correct
     * execution order.
     *
     * @method js
     * @param {String|Array} urls JS URL or array of JS URLs to load
     * @param {Function} callback (optional) callback function to execute when
     *   the specified scripts are loaded
     * @param {Object} obj (optional) object to pass to the callback function
     * @param {Object} context (optional) if provided, the callback function
     *   will be executed in this object's context
     * @static
     */
    js: function (urls, callback, obj, context) {
      load('js', urls, callback, obj, context);
    }

  };
}());
