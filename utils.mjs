export function readAllContent(filename) {
    if('fs' in globalThis) {
        try {
            return fs.readFileSync(filename, 'utf8');
        } catch {

        }
    }
    if('std' in globalThis) {
        let f = std.open(filename, 'r');
        if(f) {
            let content = f.readAsString();
            f.close();
            return content;
        }
    }
}

export function related_path(pathA, pathB) {
    pathA = pathA.split('/')
    pathB = pathB.split('/')

    let ret = [];
    let i;
    for(i=0; i<pathA.length && i<pathB.length && pathA[i]==pathB[i]; i++);
    let j = i;
    for(;i<pathB.length && pathB[i]!='';i++)
        ret.push('..');
    for(;j<pathA.length && pathA[i]!=''; j++)
        ret.push(pathA[j]);
    
    return ret.length==0?'.':ret.join('/');
}

export function simplify_path(path) {
    let dpath = path.split('/');
    let lst = [];
    for(let entry of dpath) {
        if(entry === '..' && lst.length && lst[lst.length-1]!='..' && lst[lst.length-1]!='') {
            lst.pop();
        } else if(entry === '.') {
            // ignore
        } else {
            if(entry==='' && lst.length)
                continue;
            if(entry==='..' && lst.length && lst[lst.length-1]==='')
                continue;
            lst.push(entry);
        }
    }
    if(lst.length) {
        if(lst.length==1 && lst[0]==='')
            return '/';
        else
            return lst.join('/');
    }
    // related path
    return '.';
}

export function dirname(str) {
    let ret =  str.substring(0, str.lastIndexOf("/"));
    return ret===''? '.': ret;
}

export async function polyfill() {
    let fs = await import('fs').catch(() => {})
    if(fs) {
        // node
        globalThis.fs = fs;
    } else {
        // qjs
        
        globalThis.os = await import('os').catch(() => {})
        globalThis.std = await import('std').catch(() => {})
        
    }
    if(!('setTimeout' in globalThis)) {
        globalThis.setTimeout = os.setTimeout;
    }

    if(!('clearTimeout' in globalThis)) {
        globalThis.clearTimeout = os.clearTimeout;
    }
    

    if(!('process' in globalThis)) {
        globalThis.process = {};
        process.cwd = function() { return os.getcwd()[0]; }
    }
        

    if(!process.argv && 'scriptArgs' in globalThis)
        process.argv = ['qjs', ...scriptArgs];

    if(!('info' in console))
        console.info = console.log
}


export function polyfill2() {
    if(!('setTimeout' in globalThis)) {
        globalThis.setTimeout = os.setTimeout;
    }

    if(!('clearTimeout' in globalThis)) {
        globalThis.clearTimeout = os.clearTimeout;
    }

    if(!('process' in globalThis)) {
        globalThis.process = {};
        process.cwd = function() { return os.getcwd()[0]; }
    }
        

    if(!process.argv && scriptArgs)
        process.argv = ['qjs', ...scriptArgs];
}

export function fileExist(file) {
    if('fs' in globalThis) {
        return fs.existsSync(file);
    }
    if('os' in globalThis) {
        return os.stat(file)[1] == 0;
    }
}

export function compareMTime(afile, bfile) {
    if('fs' in globalThis) {
        let astat = fs.statSync(afile);
        let bstat = fs.statSync(bfile);
        return astat.mtimeMs < bstat.mtimeMs;
    }

    let [astat, _] = os.stat(afile);
    let [bstat, __] = os.stat(bfile);
    return astat.mtime < bstat.mtime;
}


export function writeFile(filename, content) {
    if('fs' in globalThis) {
        fs.writeFileSync(filename, content);
        return;
    }
    let f = std.open(filename, 'w');
    f.puts(content);
    f.close();
}

export function getMethods(obj) {
    return Object.getOwnPropertyNames(obj).filter(item => typeof obj[item] === 'function');
}

export function getClasses(obj) {
    return Object.getOwnPropertyNames(obj).filter(item => typeof obj[item] === 'function' && obj[item].prototype);
}

export function appendSet(set, list) {
    list.forEach(set.add, set);
}
