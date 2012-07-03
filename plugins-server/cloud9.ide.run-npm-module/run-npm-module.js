/**
 * NPM Runtime Module for the Cloud9 IDE
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

var Plugin = require("../cloud9.core/plugin");
var fsnode = require("vfs-nodefs-adapter");
var util = require("util");

var name = "npm-runtime";
var ProcessManager;
var EventBus;
var VFS;
var AllowShell;
var USER;
var ALLOWEDDIRS;
var ALLOWEDEXECUTABLES;

module.exports = function setup(options, imports, register) {
    ProcessManager = imports["process-manager"];
    EventBus = imports.eventbus;
    VFS = imports.vfs;
    USER = options.user;
    ALLOWEDDIRS = options.allowedDirs;
    ALLOWEDEXECUTABLES = options.allowedExecs;
    AllowShell = !!options.allowShell;
    imports.ide.register(name, NpmRuntimePlugin, register);
};

var NpmRuntimePlugin = function(ide, workspace) {
    this.ide = ide;
    this.pm = ProcessManager;
    this.fs = fsnode(VFS);
    this.eventbus = EventBus;
    this.allowShell = AllowShell;
    this.workspace = workspace;
    this.channel = workspace.workspaceId + "::npm-runtime"; // wtf this should not be needed
    this.children = {};
    this.user = USER;
    
    this.hooks = ["command"];
    this.name = name;
    this.processCount = 0;
};

util.inherits(NpmRuntimePlugin, Plugin);

(function() {

    this.init = function() {
        var self = this;
        this.eventbus.on(this.channel, function(msg) {
            msg.type = msg.type.replace(/^(?:run\-npm|shell)-(start|data|exit)$/, "npm-module-$1");

            if (msg.type == "npm-module-start")
                self.processCount += 1;

            if (msg.type == "npm-module-exit")
                self.processCount -= 1;

            self.ide.broadcast(JSON.stringify(msg), self.name);
        });
    };

    this.command = function(user, message, client) {
        var cmd = (message.command || "").toLowerCase();
        switch(cmd) {
            case "npm-module-stdin":
                if (!this.children[message.pid])
                    return true;

                message.line = message.line + '\n';
                this.children[message.pid].child.stdin.write(message.line);
                return true;
        }
        return false;
    };

    this.$run = function(file, args, env, version, message, client) {
        var self = this;

        this.pm.spawn("run-npm", {
            file: file,
            args: args,
            env: env,
            nodeVersion: version,
            extra: message.extra,
            cwd: message.cwd,
            encoding: "ascii"
        }, self.channel, function(err, pid, child) {
            if (err)
                return self.error(err, 1, message, client);

            self.children[pid] = child;
        });
    };

    this.searchAndRunModuleHook = function(message, user, cb) {
        if (!message.command || !message.argv)
            return cb(null, false);

        if (user.permissions.fs != "rw")
            return cb("Permission denied", false);
            
        var server_exclude = (user.permissions.server_exclude || "").split("|");
        for (var command in server_exclude) {
            if (message.command == command || message.argv.join(" ").indexOf(command) > -1) {
                return cb("Permission denied", false);
            }
        }

        if (message.command === "node")
            return this.$run(message.argv[1], message.argv.slice(2), message.env || {},  message.version, message, null);

        var self = this;
        this.searchAndRunShell(message, function(err, found) {
            if (err || found)
                return cb(err, found);

            self.searchForModuleHook(message.command, function(found, filePath) {
                if (!found)
                    return cb(null, false);

                if (message.argv.length)
                    message.argv.shift();

                self.$run(filePath, message.argv || [], message.env || {},  message.version, message, null);
            });
        });
    };

    this.searchAndRunShell = function(message, callback) {
        if (!this.allowShell)
            return callback(null, false);

        var self = this;
        var ws   = self.ide.workspaceDir;
        var cwd  = message.cwd || ws;

        var isAllowedExecutable = !this.user || this.user.runvmSsh || !ALLOWEDEXECUTABLES 
            || ALLOWEDEXECUTABLES.indexOf(message.command) > -1;

        this.pm.exec("shell", {
            command: "which",
            args: [message.command],
            cwd: cwd
        }, function(code, out, err) {
            if (code)
                return callback(null, false);
            
            if (!isAllowedExecutable) {
                var found = false;
                for (var i = 0, wsl = ws.length; i < ALLOWEDDIRS.length; i++) {
                    if (out.substr(0, wsl + ALLOWEDDIRS[i].length) == ws + ALLOWEDDIRS[i]) {
                        found = true;
                        break;
                    }
                }
                
                if (!found)
                    return callback("This command is only available in premium plans. "
                        + "<a href='javascript:void(0)' onclick='require(\"ext/upgrade/upgrade\").suggestUpgrade()'>Click here to Upgrade.</a>", false);
            }

            // use resolved command
            message.argv[0] = out.split("\n")[0];
            
            message.argv = message.argv.map(function (arg) {
                // if an argument has spaces, then wrap it in double quotes
                // to ensure that it gets correctly ran by our good friend shell
                if (arg.indexOf(" ") > -1) {
                    return '"' + arg + '"';
                }
                
                return arg;
            });

            self.pm.spawn("shell", {
                command: "sh",
                args: ["-c", message.argv.join(" ")],
                cwd: cwd,
                extra: message.extra,
                encoding: "ascii"
            }, self.channel, function(err, pid, child) {
                if (err)
                    return self.error(err, 1, message);

                self.children[pid] = child;
            });
        });
    };

    this.searchForModuleHook = function(command, cb) {
        var baseDir = this.ide.workspaceDir + "/node_modules";
        var fs = this.fs;

        function searchModules(dirs, it) {
            if (!dirs[it])
                return cb(false);

            var currentDir = baseDir + "/" + dirs[it];
            fs.readFile(currentDir + "/package.json", "utf-8", function(err, file) {
                if (err)
                    return searchModules(dirs, it+1);

                try {
                    file = JSON.parse(file);
                }
                catch (ex) {
                    return searchModules(dirs, it+1);
                }

                if (!file.bin)
                    return searchModules(dirs, it+1);

                for (var binIdent in file.bin) {
                    if (binIdent === command)
                        return cb(true, currentDir + "/" + file.bin[binIdent]);
                }

                searchModules(dirs, it+1);
            });
        }

        fs.readdir(baseDir, function(err, res) {
            if (err)
                return cb(false);

            searchModules(res, 0);
        });
    };

    this.$kill = function(pid, message, client) {
        this.pm.kill(pid, function(err) {
            if (err)
                return this.error(err, 1, message, client);
        });
    };

    this.canShutdown = function() {
        return this.processCount === 0;
    };

}).call(NpmRuntimePlugin.prototype);
