import {basename} from './utils.mjs'

let __matches,
    __slice = [].slice;

export class Getopt {
    HAS_ARGUMENT = true;

    NO_ARGUMENT = false;

    MULTI_SUPPORTED = true;

    SINGLE_ONLY = false;

    VERSION = '0.3.2';

    constructor(optionsPattern) {
        this.short_options = {};
        this.long_options = {};
        this.long_names = [];
        this.events = {};
        this.argv = [];
        this.options = {};
        this.unique_names = {};
        this.optionsPattern = [];
        this.errorFunc = function (e) {
            console.info(e.message);
            return process.exit(1);
        };
        if (process.argv[1]) {
            this.help = "Usage:\n  "+basename(process.argv[0])+" " + (basename(process.argv[1])) + " [OPTION]\n\nOptions:\n[[OPTIONS]]";
        } else {
            this.help = "[[OPTIONS]]";
        }
        this.append(optionsPattern);
    }

    append (optionsPattern) {
        var comment, def, definition, fixed_long_name, has_argument, long_name, multi_supported, name, option, optional, short_name, _i, _len;
        for (_i = 0, _len = optionsPattern.length; _i < _len; _i++) {
            option = optionsPattern[_i];
            short_name = option[0], definition = option[1], comment = option[2], def = option[3];
            if (comment == null) {
                comment = '';
            }
            if (definition == null) {
                definition = '';
            }
            if (short_name == null) {
                short_name = '';
            }
            __matches = definition.match(/^([\w\-]*)/);
            long_name = __matches[1];
            has_argument = definition.indexOf('=') !== -1;
            multi_supported = definition.indexOf('+') !== -1;
            optional = /\[=.*?\]/.test(definition);
            long_name = long_name.trim();
            short_name = short_name.trim();
            if (optional && short_name) {
                throw new Error('optional argument can only work with long option');
            }
            long_name || (long_name = short_name);
            fixed_long_name = 'opt_' + long_name;
            name = long_name;
            if (long_name === '') {
                throw new Error("empty option found. the last option name is " + (this.long_names.slice(-1)));
            }
            if (this.unique_names[fixed_long_name] == null) {
                this.long_names.push(long_name);
                this.long_options[long_name] = {
                    name: name,
                    short_name: short_name,
                    long_name: long_name,
                    has_argument: has_argument,
                    multi_supported: multi_supported,
                    comment: comment,
                    optional: optional,
                    definition: definition,
                    def: def
                };
                this.unique_names[fixed_long_name] = true;
            } else {
                throw new Error("option " + long_name + " is redefined.");
            }
            if (short_name !== '') {
                if (short_name.length !== 1) {
                    throw new Error('short option must be single characters');
                }
                this.short_options[short_name] = this.long_options[long_name];
            }
        }
        return this;
    };

    fill (pattern) {
        var l, l_, s, s_;
        s_ = pattern[0], l_ = pattern[1];
        s = '';
        l = '';
        this.short_options[s_] || (s = s_);
        this.long_options[l_] || (l = l_);
        if (s || l) {
            return this.append([[s, l].concat(__slice.call(pattern.slice(2)))]);
        }
    };

    getOptionByName(name) {
        var _ref;
        return (_ref = this.long_options[name]) != null ? _ref : this.short_options[name];
    };

    getOptionName(name) {
        var _ref;
        return (_ref = this.getOptionByName(name)) != null ? _ref.name : void 0;
    };

    on(name, cb) {
        var iname;
        if (name) {
            iname = this.getOptionName(name);
            if (!iname) {
                throw new Error("unknown option " + name);
            }
        } else {
            iname = name;
        }
        this.events[iname] = cb;
        return this;
    };

    emit(name, value) {
        var event;
        event = this.events[this.getOptionName(name)];
        if (event) {
            return event.call(this, value);
        } else {
            throw new Error("Getopt event on '" + name + "' is not found");
        }
    };

    save_option_(options, option, argv) {
        var name, value, _ref;
        if (option.has_argument) {
            if (argv.length === 0) {
                throw new Error("option " + option.long_name + " need argument");
            }
            value = argv.shift();
        } else {
            value = true;
        }
        name = option.name;
        if (option.multi_supported) {
            if (options[name] == null) {
                options[name] = [];
            }
            options[name].push(value);
        } else {
            options[name] = value;
        }
        if ((_ref = this.events[name]) != null) {
            _ref.call(this, value);
        }
        return this;
    };

    parse(argv) {
        var arg, e, i, long_name, name, option, rt_argv, rt_options, short_name, short_names, sname, value, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref, _ref1, _ref2, _ref3;
        try {
            argv = argv.slice(0);
            rt_options = {};
            rt_argv = [];
            _ref = this.long_names;
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                long_name = _ref[_i];
                option = this.long_options[long_name];
                if ((option.def != null) || (rt_options[option.long_name] != null)) {
                    rt_options[option.long_name] = option.def;
                }
            }
            while ((arg = argv.shift()) != null) {
                if (__matches = arg.match(/^-(\w[\w\-]*)/)) {
                    short_names = __matches[1];
                    for (i = _j = 0, _len1 = short_names.length; _j < _len1; i = ++_j) {
                        short_name = short_names[i];
                        option = this.short_options[short_name];
                        if (!option) {
                            throw new Error("invalid option " + short_name);
                        }
                        if (option.has_argument) {
                            if (i < arg.length - 2) {
                                argv.unshift(arg.slice(i + 2));
                            }
                            this.save_option_(rt_options, option, argv);
                            break;
                        } else {
                            this.save_option_(rt_options, option, argv);
                        }
                    }
                } else if (__matches = arg.match(/^--(\w[\w\-]*)((?:=[^]*)?)$/)) {
                    long_name = __matches[1];
                    value = __matches[2];
                    option = this.long_options[long_name];
                    if (!option) {
                        throw new Error("invalid option " + long_name);
                    }
                    if (value !== '') {
                        value = value.slice(1);
                        argv.unshift(value);
                    } else if (option.optional) {
                        argv.unshift('');
                    }
                    this.save_option_(rt_options, option, argv);
                } else if (arg === '--') {
                    rt_argv = rt_argv.concat(argv);
                    for (_k = 0, _len2 = argv.length; _k < _len2; _k++) {
                        arg = argv[_k];
                        if ((_ref1 = this.events['']) != null) {
                            _ref1.call(this, arg);
                        }
                    }
                    break;
                } else {
                    rt_argv.push(arg);
                    if ((_ref2 = this.events['']) != null) {
                        _ref2.call(this, arg);
                    }
                }
            }
            _ref3 = Object.keys(rt_options);
            for (_l = 0, _len3 = _ref3.length; _l < _len3; _l++) {
                name = _ref3[_l];
                sname = this.long_options[name].short_name;
                if (sname !== '') {
                    rt_options[sname] = rt_options[name];
                }
            }
        } catch (_error) {
            e = _error;
            this.errorFunc(e);
        }
        this.argv = rt_argv;
        this.options = rt_options;
        return this;
    };

    parseSystem() {
        return this.parse(process.argv.slice(2));
    }

    setHelp(help) {
        this.help = help;
        return this;
    }

    sort() {
        return this.long_names.sort(function (a, b) {
            return a > b && 1 || a < b && -1 || 0;
        });
    }

    getHelp() {
        var comment, def, definition, i, line, lines, long_name, n, option, options, short_name, table, td, tr, ws, _i, _j, _k, _len, _len1, _len2, _ref;
        ws = [];
        options = [];
        table = [];
        _ref = this.long_names;
        
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            long_name = _ref[_i];
            tr = [];
            option = this.long_options[long_name];
            short_name = option.short_name, long_name = option.long_name, comment = option.comment, definition = option.definition, def = option.def;
            tr.push(short_name ? short_name === long_name ? "  -" + short_name : "  -" + short_name + ", --" + definition : "      --" + definition);
            tr.push(" " + comment);
            if (def) {
                tr.push(" (default: " + def + ")");
            }
            table.push(tr);
        }
        for (_j = 0, _len1 = table.length; _j < _len1; _j++) {
            tr = table[_j];
            for (i = _k = 0, _len2 = tr.length; _k < _len2; i = ++_k) {
                td = tr[i];
                if (ws[i] == null) {
                    ws[i] = 0;
                }
                ws[i] = Math.max(ws[i], td.length);
            }
        }
        lines = (function () {
            var _l, _len3, _len4, _m, _results;
            _results = [];
            for (_l = 0, _len3 = table.length; _l < _len3; _l++) {
                tr = table[_l];
                line = '';
                for (i = _m = 0, _len4 = tr.length; _m < _len4; i = ++_m) {
                    td = tr[i];
                    if (i) {
                        n = ws[i - 1] - tr[i - 1].length;
                        while (n--) {
                            line += ' ';
                        }
                    }
                    line += td;
                }
                _results.push(line.trimRight());
            }
            return _results;
        })();
        return this.help.replace('[[OPTIONS]]', lines.join("\n"));
    }

    showHelp() {
        console.info(this.getHelp());
        return this;
    }

    bindHelp(help) {
        if (help) {
            this.setHelp(help);
        }
        this.fill(['h', 'help', 'display this help']);
        this.on('help', function () {
            this.showHelp();
            return process.exit(0);
        });
        return this;
    }

    getVersion() {
        return Getopt.VERSION;
    }

    error(errorFunc) {
        this.errorFunc = errorFunc;
        return this;
    }

    getVersion = function () {
        return this.VERSION;
    }

    create = function (options) {
        return new Getopt(options);
    }
}