'use strict';

/**
 * HooksManager
 * @namespace HooksManager
 * @description Manage Hooks registration/loading
 */

const config = require('./config');
const logger = require('./logger');

const Promise = require('promise');
const escape_string_regexp = require('escape-string-regexp');
const _ = require('lodash');
const s = require('underscore.string');
_.mixin(s.exports());

const path = require('path');
const dir = path.resolve(__dirname, '..');
let hooks_dir = process.env.TEL_HOOKS_DIR || (path.isAbsolute(config.get('hooks:folder')) ? config.get('hooks:folder') : path.resolve(dir, config.get('hooks:folder')));

let hooks_cache = [];

/**
 * @function work_hook
 * @description Validates and extends passed Hook
 * @static
 * @param {Object} hook_def Hook reference
 * @param {String} hook_path Hook path relative to hooks_dir
 * @memberof HooksManager
 * @private
 * @returns {Object|Boolean}
 */

const work_hook = function (hook_def, hook_path) {
  if (hook_def) {
    if (_.isArray(hook_def)) {
      let out_array = _.map(hook_def, function (inner_hook_def) {
        return work_hook(inner_hook_def, hook_path);
      });
      return out_array;
    }

    if (((hook_def.match || hook_def.command) && (hook_def.action || hook_def.shell || hook_def.signal)) || (hook_def.route) || (hook_def.exec) || (hook_def.gpio) || (hook_def.parse_response) || (hook_def.check) || (hook_def.start_monitor && hook_def.stop_monitor)) {
      hook_def.path = hook_path;
      hook_def.namespace = hook_def.namespace || path.dirname(hook_path) || 'default';
      hook_def.name = hook_def.name || path.basename(hook_path, path.extname(hook_path));
      hook_def.full_name = `${_.underscored(_.slugify(hook_def.namespace))}/${_.underscored(_.slugify(hook_def.name))}`;
      hook_def.route_path = hook_def.route ? (hook_def.route_path || _.replaceAll(hook_def.full_name.toLowerCase(), '_', '/')) : null;
      hook_def.cmd_name = hook_def.exec ? (hook_def.cmd_name || _.replaceAll(_.replaceAll(hook_def.full_name.toLowerCase(), '_', ':'), '/', ':')) : null;

      hook_def.has_monitor_hook = _.isFunction(hook_def.check) || (_.isFunction(hook_def.start_monitor) && _.isFunction(hook_def.stop_monitor)) || (_.isObject(hook_def.gpio) && _.isFunction(hook_def.gpio.handler));
      hook_def.has_local_hook = (_.isFunction(hook_def.signal) || _.isArray(hook_def.signal)) || _.isString(hook_def.shell) || _.isFunction(hook_def.action) || _.isString(hook_def.action) || _.isFunction(hook_def.parse_response);
      hook_def.has_web_hook = _.isFunction(hook_def.route);
      hook_def.has_command_line_hook = _.isFunction(hook_def.exec) || _.isString(hook_def.exec);

      if (hook_def.parse_response && !hook_def.action) {
        hook_def.action = true;
      }

      if (hook_def.command) {
        if (hook_def.command.indexOf('/') === -1) {
          hook_def.command = `/${hook_def.command}`;
        }
        hook_def.command = hook_def.command.toLowerCase();
        hook_def.match = new RegExp(`${escape_string_regexp(hook_def.command)}\s*(.*)`, 'i');
      }

      if (hook_def.match && _.isString(hook_def.match)) {
        hook_def.match = new RegExp(escape_string_regexp(hook_def.match), 'im');
      }

      return hook_def;
    }
  }
  return false;
};

/**
 * @class
 * @classdesc Manage Hooks registration/loading
 */

const HooksManager = {
  /**
   * @function get_hooks_dir
   * @description Return hooks dir
   * @static
   * @memberof HooksManager
   * @public
   * @returns {String}
   */
  get_hooks_dir: function () {
    return hooks_dir;
  },

  /**
   * @function get_hooks
   * @description Return loaded hooks, filtering and/or grouping them if required
   * @param {String} filter_by Filter hooks by this field
   * @param {String} group_by Group returned hook by this field
   * @static
   * @memberof HooksManager
   * @public
   * @returns {Object|Array}
   */

  get_hooks: function (filter_by, group_by) {
    let out_val = hooks_cache;

    if (filter_by) {
      out_val = _.filter(out_val, function (hook) {
        return !!(hook[filter_by]);
      });
    }

    if (group_by) {
      out_val = _.keyBy(_.sortBy(out_val, group_by), group_by);
    }

    return out_val;
  },

  /**
   * @function get_commands
   * @description Return local hooks
   * @static
   * @memberof HooksManager
   * @public
   * @returns {Object[]}
   */

  get_commands: function () {
    let cmd_hooks = HooksManager.get_hooks('has_local_hook');
    let out = [];
    _.each(cmd_hooks, function (el) {
      if (el.command) {
        out.push({
          command: el.command,
          description: el.description
        });
      }
    });
    return out;
  },
  /**
   * @function reload
   * @description Load hooks from directory
   * @static
   * @memberof HooksManager
   * @public
   * @returns {Promise}
   */
  reload: function (new_hooks_dir) {
    if (new_hooks_dir) {
      hooks_dir = new_hooks_dir;
    }
    logger.log(`Reloading hooks`);
    hooks_cache = [];
    return HooksManager.load();
  },
  /**
   * @function load
   * @description Load hooks from directory or cache
   * @static
   * @memberof HooksManager
   * @public
   * @returns {Promise}
   */
  load: function () {
    if (hooks_cache.length > 0) {
      return Promise.resolve();
    }

    return new Promise(function (resolve, reject) {
      const glob = require('glob');
      const options = {
        cwd: hooks_dir,
        root: hooks_dir,
        ignore: [
          'node_modules/*.{js,json}',
          'node_modules/**/*.{js,json}',
          '**/node_modules/*.{js,json}',
          '**/node_modules/**/*.{js,json}'
        ]
      };
      const hooks_pattern = '**/*.{js,json}';

      glob(hooks_pattern, options, function (error, matches) {
        if (error) {
          return reject(error);
        }
        matches = matches || [];
        hooks_cache = _.compact(_.flatten(_.map(matches, function (hook_path) {
          let hook_complete_path = path.resolve(hooks_dir, hook_path);
          let hook_def = require(hook_complete_path);

          return work_hook(hook_def, hook_path);
        })));
        resolve();
      });
    });
  }
};

module.exports = HooksManager;
