import {JSClassIR, ClassIR} from './generator.mjs'

export function generate(classIR, indent, generated) {
    generated = generated? generated: new Set();
    
    indent = indent? indent: 0;
    let src = '', depSrc = '';

    if(generated.has(classIR.objName)) {
        return ['', ''];
    }

    if(classIR instanceof JSClassIR) {
        for(let dep of classIR.getDeps()) {
            let [src_, depSrc_] = generate(dep, indent, generated);
            depSrc += depSrc_;
            depSrc += src_;
        }
        src += `${classIR.class}`;

        generated.add(classIR.objName);
        return [src, depSrc];
    } else if(classIR instanceof ClassIR) {

        let indentStr = ' '.repeat(indent);

        let [src_, depSrc_] = generate(classIR.parent, 0, generated);
        depSrc+=depSrc_;
        depSrc+=src_;


        let propDecl = '';
        let propInit = '', postPropInit = '';
        for(const [pname, pvalue] of Object.entries(classIR.props)) {
            propDecl +=`${' '.repeat(indent+8)}this.addProperty('${pname}');\n`;
            const [propInit_, postPropInit_] = generatePropInit(pname, pvalue, indent+8);
            propInit += propInit_;
            postPropInit += postPropInit_;
        }

        let signalDecl = ''
        for(const [sname, svalue] of Object.entries(classIR.signals)) {
            // Since we allow signal naming to xxxChanged, but property may also add xxxChanged
            // special case: signal positionChanged signal in MouseArea
            if(!(sname.endsWith('Changed') && sname.substr(0, sname.length-7) in classIR.props))
                signalDecl +=`${' '.repeat(indent+8)}this.addSignal('${sname}');\n`;
        }


        let attrInit = '';
        let postAttrInit = '';
        for(const [aname, avalue] of Object.entries(classIR.attributes)) {
            const [attrInit_, postAttrInit_] = generateAttribInit(aname, avalue, indent+8);
            attrInit += attrInit_;
            postAttrInit += postAttrInit_;

        }

        let finalize = '';
        if('onCompleted' in classIR.handlers) {
            finalize = `${' '.repeat(indent+8)}${classIR.objName}.prototype.onCompleted.call(this);\n`;
        }

        let funcsDecl = generateFunctions(classIR.funcs, indent+4);
        let handlersDecl = generateHandlers(classIR.handlers, indent+4);
        let handlersConnections = connectHandlers(classIR.handlers, indent+8);
        let [childrenDecl, depSrc__, childrenInit] = generateChildren(classIR.children, indent+8, generated);
        depSrc+=depSrc__;

        src += `
${indentStr}class ${classIR.objName} extends ${classIR.parent.objName} {
${indentStr}    constructor(parent, params) {
${indentStr}        params = params? params: {};
${attrInit}
${indentStr}        super(parent, params);
${propDecl}${signalDecl}${postAttrInit}${postPropInit}${handlersConnections}${propInit}${childrenDecl}${childrenInit}${finalize}
${indentStr}    }
${funcsDecl}${handlersDecl}
${indentStr}}
    
`;


        generated.add(classIR.objName);
        return [src, depSrc];
    }
        
}

function generatePropInit(pname, pvalue, indent) {
    let initVal;
    let postAssign = '';
    switch(pvalue.type) {
        case 'bool':
            initVal = pvalue.value? `${pvalue.value}`: 'false';
            break;
        case 'int':
        case 'real':
            initVal = pvalue.value? `${pvalue.value}`: '0';
            break;
        case 'string':
            initVal = pvalue.value? `'${pvalue.value}'`: `''`;
            break;
        case 'Expression':
            let pdeps = '';
            for(let dep of pvalue.thisDeps) {
                pdeps += `let ${dep}=this.${dep};\n`;
                postAssign += `${' '.repeat(indent)}chainConnect(this, '${dep}', () => {
${' '.repeat(indent+4)}this._${pname}Dirty = true; this.${pname}Changed.emit(); })\n`;
            }
            initVal = `() => {${pdeps} return ${pvalue.value}};`
            console.log('Warning: Expression binding is not fully support yet')
            break;
        case 'Object':
            break;
    }
    return [`${' '.repeat(indent)}this.${pname} = params && params.${pname}? params.${pname}: ${initVal};\n`, postAssign];
}

function generateAttribInit(aname, avalue, indent) {
    let initVal;
    let postAssign = '';
    switch(avalue.type) {
        case 'Literal':
            initVal = (typeof avalue.value === 'string')?`'${avalue.value}'`: `${avalue.value}`;
            break;
        case 'Expression':
            let adeps = '';
            for(let dep of avalue.thisDeps) {
                adeps += `let ${dep}=this.${dep};\n`;
                postAssign += `${' '.repeat(indent)}chainConnect(this, '${dep}', () => {
${' '.repeat(indent+4)}this._${aname}Dirty = true; this.${aname}Changed.emit(); })\n`;
            }
            initVal = `() => {${adeps} return ${avalue.value}};`
            console.log('Warning: Expression binding is not fully support yet')
            break;
        case 'Object':
            break;
    }
    return [`${' '.repeat(indent)}params.${aname} = ${initVal};\n`, postAssign];
}

function generateFunctions(funcs, indent) {
    let ret = '';
    let indentStr = ' '.repeat(indent);
    for(const [fname, fvalue] of Object.entries(funcs)) {
        let params = fvalue.params.map(x => x.name).join(',')
        let fdeps = '';
        for(let dep of fvalue.thisDeps) {
            fdeps += `${indentStr}    let ${dep}=this.${dep};\n`;
        }
        ret += `${indentStr}${fname}(${params}) {
${fdeps}
${fvalue.src}
${indentStr}}
`;
    }
    return ret;

}

function generateHandlers(handlers, indent) {
    let ret = '';
    let indentStr = ' '.repeat(indent);
    for(const [hname, hvalue] of Object.entries(handlers)) {
        let params = hvalue.params.map(x => x.name).join(',')
        let fdeps = '';
        for(let dep of hvalue.thisDeps) {
            fdeps += `${indentStr}    let ${dep}=this.${dep};\n`;
        }
        ret += `${indentStr}${hname}(${params}) { 
${fdeps}
${hvalue.src}
${indentStr}}
`;
    }
    return ret;

}

function connectHandlers(handlers, indent) {
    let ret = '';
    let indentStr = ' '.repeat(indent);
    
    for(const [hname, hvalue] of Object.entries(handlers)) {
        // Special case
        if(hname === 'onCompleted')
            continue;
        let signame = hname[2].toLowerCase() + hname.slice(3);
        ret += `${indentStr}this.${signame}.connect(this.${hname}.bind(this));\n`;
    }
    return ret;

}

function generateChildren(children, indent, generated) {
    let src = '', depSrc = '', srcInit = '';
    for(let child of children) {
        const [src_, depSrc_] =  generate(child, indent, generated);
        src+=src_;
        depSrc+=depSrc_;
        srcInit += `${' '.repeat(indent)}this.appendChild(new ${child.objName}(this));\n`;
    }
    return [src, depSrc, srcInit];
}