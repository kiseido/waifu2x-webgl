// functions

function println(msg) {
    console.log(msg);
}

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(() => { resolve(); }, ms);
    });
}

function clamp(v, min, max) {
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

function clamp0_FF(v) {
    return clamp(v, 0, 0xFF);
}

function packRGBA(r, g, b, a) {
    return ((r & 0xFF) << 0) |
        ((g & 0xFF) << 8) |
        ((b & 0xFF) << 16) |
        ((a & 0xFF) << 24);
}

/**
    * @return {HTMLCanvasElement}
    */
function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

// prototype 

ImageData.prototype.toCanvas = function () {
    const out = createCanvas(this.width, this.height);
    const ctx = out.getContext('2d')
    ctx.putImageData(this, 0, 0);
    return out;
};

/**
 * @return {HTMLCanvasElement}
 */
HTMLImageElement.prototype.toCanvas = function () {
    const image = this;
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
};

HTMLImageElement.prototype.toBitmap32 = function () {
    return this.toCanvas().toBitmap32();
};

/**
 * @return {ImageData}
 */
HTMLCanvasElement.prototype.getImageData = function () {
    return this.getContext('2d').getImageData(0, 0, this.width, this.height);
};

/**
 * @return {Bitmap32}
 */
HTMLCanvasElement.prototype.toBitmap32 = function () {
    const imageData = this.getImageData();
    return new Bitmap32(imageData.width, imageData.height, new Uint8Array(imageData.data.buffer));
};

/**
 * @return {HTMLCanvasElement}
 */
HTMLCanvasElement.prototype.putImageData = function (imageData) {
    this.getContext('2d').putImageData(imageData, 0, 0);
    return this;
};

/**
 * @return {HTMLCanvasElement}
 */
HTMLCanvasElement.prototype.scale = function (sx, sy) {
    const i = this.getImageData();
    const o = new ImageData(i.width * sx, i.height * sy);
    for (let y = 0; y < o.height; y++) {
        for (let x = 0; x < o.width; x++) {
            const ix = (x / sx) | 0;
            const iy = (y / sy) | 0;
            const opos = (x + y * o.width) * 4;
            const ipos = (ix + iy * i.width) * 4;
            // noinspection PointlessArithmeticExpressionJS
            o.data[opos + 0] = i.data[ipos + 0];
            o.data[opos + 1] = i.data[ipos + 1];
            o.data[opos + 2] = i.data[ipos + 2];
            o.data[opos + 3] = i.data[ipos + 3];
        }
    }
    return createCanvas(o.width, o.height).putImageData(o);
};

async function readJson(path) {
    return await (await fetch(path)).json()
        .catch(function () { throw new Error(); });
}

async function readText(path) {
    return await (await fetch(path)).text();
}



Float32Array.prototype.normalized = function () {
    const out = new Float32Array(this.length);
    let min = Infinity;
    let max = -Infinity;
    for (let n = 0; n < this.length; n++) {
        min = Math.min(min, this[n]);
        max = Math.max(max, this[n]);
    }
    const maxLen = max - min;
    for (let n = 0; n < this.length; n++) {
        out[n] = (this[n] - min) / maxLen;
    }
    return out
};

Float32Array.prototype.alphaTo1 = function () {
    const out = new Float32Array(this.length);
    for (let n = 0; n < this.length; n++) {
        out[n] = ((n % 4) === 3) ? 1 : this[n];
    }
    return out
};

// Classes

class GlProgram {
    /**
     * @param {WebGLRenderingContext}gl
     * @param {string} vertexSource
     * @param {string} fragmentSource
     */
    constructor(gl, vertexSource, fragmentSource) {
        this.gl = gl;
        this.program = gl.createProgram();
        this.fragment = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
        this.vertex = this.createShader(gl.VERTEX_SHADER, vertexSource);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.attachShader(this.program, shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
    }

    use() {
        this.gl.useProgram(this.program);
    }

    dispose() {
        this.gl.deleteShader(this.fragment);
        this.gl.deleteShader(this.vertex);
        this.gl.deleteProgram(this.program);
    }
}

class GlBuffer {
    /**
     * @param {WebGLRenderingContext}gl
     * @param {int} type
     */
    constructor(gl, type = gl.ARRAY_BUFFER) {
        this.gl = gl;
        this.type = type;
        this.buffer = gl.createBuffer();
    }

    use() {
        this.gl.bindBuffer(this.type, this.buffer);
        return this;
    }

    /**
     * @return {GlBuffer}
     */
    uploadFloats(data) {
        this.use();
        this.gl.bufferData(this.type, new Float32Array(data), this.gl.STATIC_DRAW);
        return this;
    }

    /**
     * @return {GlBuffer}
     */
    uploadShorts(data) {
        this.use();
        this.gl.bufferData(this.type, new Uint16Array(data), this.gl.STATIC_DRAW);
        return this;
    }

    dispose() {
        this.gl.deleteBuffer(this.buffer);
    }
}

class GlTexture2d {
    /**
     * @param {WebGLRenderingContext}gl
     */
    constructor(gl) {
        this.gl = gl;
        this.width = 0;
        this.height = 0;
        this.tex = gl.createTexture();
    }

    setRgbaData(width, height, data) {
        let gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = data;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return this;
    }

    setFloat4Data(width, height, data) {
        let gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = data;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return this;
    }

    setFloatData(data, width = data.length % 2048, height = Math.ceil(data.length / 2048)) {
        let gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = data;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, data);
        return this;
    }

    setEmptyFloat4(width, height) {
        let gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = null;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, null);
        return this;
    }

    setEmptyRgba(width, height) {
        let gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = null;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return this;
    }

    bind(unit = 0) {
        let gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        return this;
    }

    _renderCommon(width, height, callback) {
        let gl = this.gl;
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.viewport(0, 0, width, height);
        try {
            callback(this)
        } finally {
            gl.deleteFramebuffer(fb)
        }
    }

    renderFloat4(width, height, callback) {
        this.setEmptyFloat4(width, height);
        this._renderCommon(width, height, callback);
    }

    renderRgba(width, height, callback) {
        this.setEmptyRgba(width, height);
        this._renderCommon(width, height, callback);
    }

    dispose() {
        this.gl.deleteTexture(this.tex);
    }
}

class BatchBuilder {
    constructor() {
        this.vertices = [];
        this.indices = [];
        this.npoints = 0;
    }

    addPoint(x, y, vx, vy, noutput) {
        //console.log('vertex', x, y, noutput);
        this.vertices.push(x);
        this.vertices.push(y);
        this.vertices.push(vx);
        this.vertices.push(vy);
        this.vertices.push(noutput);
        this.npoints++;
    }

    addQuad(x, y, width, height, noutput) {
        const vpos = this.npoints;

        this.addPoint(x, y, 0, 0, noutput);
        this.addPoint(x + width, y, width, 0, noutput);
        this.addPoint(x, y + height, 0, height, noutput);
        this.addPoint(x + width, y + height, width, height, noutput);

        this.indices.push(vpos + 0);
        this.indices.push(vpos + 1);
        this.indices.push(vpos + 2);
        this.indices.push(vpos + 2);
        this.indices.push(vpos + 1);
        this.indices.push(vpos + 3);
    }
}

class Bitmap32 {
    constructor(width, height, data = null) {
        if (data == null) data = new Uint8Array(width * height * 4);
        this.data = data;
        this.width = width;
        this.height = height;
        this.area = width * height;
    }

    static fromFloat(width, height, floats) {
        const out = new Bitmap32(width, height);
        const cdata = new Uint8ClampedArray(out.data.buffer);
        let m = 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // noinspection PointlessArithmeticExpressionJS
                cdata[m + 0] = floats[m + 0] * 255;
                cdata[m + 1] = floats[m + 1] * 255;
                cdata[m + 2] = floats[m + 2] * 255;
                cdata[m + 3] = floats[m + 3] * 255;
                m += 4;
            }
        }
        return out;
    }

    toFloat() {
        const area = this.area;
        const out = new Float32Array(this.width * this.height * 4);
        for (let n = 0; n < area * 4; n++) out[n] = this.data[n] / 255;
        return out;
    }

    toImageData() {
        return new ImageData(new Uint8ClampedArray(this.data.buffer), this.width, this.height);
    }

    toCanvas() {
        return this.toImageData().toCanvas();
    }

    index(x, y) {
        return (y * this.width + x) * 4;
    }

    valid(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    /**
     * @return {Bitmap32}
     */
    sliceCopy(left, top, right, bottom) {
        const width = right - left;
        const height = bottom - top;
        const out = new Bitmap32(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const ix = x + left;
                const iy = y + top;
                out.set(x, y, this.valid(ix, iy) ? this.get(ix, iy) : 0)
            }
        }
        return out;
    }

    set(x, y, value) {
        const i = this.index(x, y);
        this.data[i + 3] = (value >> 24);
        this.data[i + 2] = (value >> 16);
        this.data[i + 1] = (value >> 8);
        this.data[i + 0] = (value >> 0);
    }

    get(x, y) {
        const i = this.index(x, y);
        return (this.data[i + 3] << 24) |
            (this.data[i + 2] << 16) |
            (this.data[i + 1] << 8) |
            (this.data[i + 0] << 0);
    }

    getY(r, g, b) {
        return clamp0_FF((0 + (0.299 * r) + (0.587 * g) + (0.114 * b)));
    }

    getCb(r, g, b) {
        return clamp0_FF((128 - (0.168736 * r) - (0.331264 * g) + (0.5 * b)));
    }

    getCr(r, g, b) {
        return clamp0_FF((128 + (0.5 * r) - (0.418688 * g) - (0.081312 * b)));
    }

    getR(y, cb, cr) {
        return clamp0_FF((y + 1.402 * (cr - 128)));
    }

    getG(y, cb, cr) {
        return clamp0_FF((y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128)));
    }

    getB(y, cb, cr) {
        return clamp0_FF((y + 1.772 * (cb - 128)));
    }

    rgbaToYCbCr() {
        const out = new Bitmap32(this.width, this.height);
        let m = 0;
        for (let n = 0; n < out.area; n++) {
            const r = this.data[m + 0];
            const g = this.data[m + 1];
            const b = this.data[m + 2];
            const a = this.data[m + 3];

            out.data[m + 0] = this.getY(r, g, b);
            out.data[m + 1] = this.getCb(r, g, b);
            out.data[m + 2] = this.getCr(r, g, b);
            out.data[m + 3] = a;

            m += 4;
        }
        return out;
    }

    yCbCrToRgba() {
        const out = new Bitmap32(this.width, this.height);
        let m = 0;
        for (let n = 0; n < out.area; n++) {
            const y = this.data[m + 0];
            const cb = this.data[m + 1];
            const cr = this.data[m + 2];
            const a = this.data[m + 3];

            out.data[m + 0] = this.getR(y, cb, cr);
            out.data[m + 1] = this.getG(y, cb, cr);
            out.data[m + 2] = this.getB(y, cb, cr);
            out.data[m + 3] = a;

            m += 4;
        }
        return out;
    }
}