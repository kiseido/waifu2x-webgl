class Waifu2x {
    waifu2x(chunk) {
        const chunkY = chunk.rgbaToYCbCr();
        let out = new Float32Array(this.blockSize * this.blockSize * 4);
        let inp = new GlTexture2d(gl).setFloat4Data(chunkY.width, chunkY.height, chunkY.toFloat());

        for (let step = 0; step < 7; step++) {
            const bias = this.biases[step];
            const kernel = this.kernels[step];
            const program = this.programs[step];
            const nInputPlane = this.steps[step].nInputPlane;
            const nOutputPlane = this.steps[step].nOutputPlane;
            const outXBlocks = Math.min(nOutputPlane, 16);
            const outYBlocks = Math.ceil(nOutputPlane / 16);

            //console.log(`nInputPlane=${nInputPlane}, nOutputPlane=${nOutputPlane}, outXBlocks=${outXBlocks}, outYBlocks=${outYBlocks}`);

            let outp = new GlTexture2d(gl);
            const outWidth = outXBlocks * this.blockSize;
            const outHeight = outYBlocks * this.blockSize;
            //const rout = new Float32Array(outWidth * outHeight * 4);
            outp.renderFloat4(outWidth, outHeight, (rb) => {
                program.use();

                const aPos = gl.getAttribLocation(program.program, "aPos");
                const aInPos = gl.getAttribLocation(program.program, "aInPos");
                gl.uniform2f(gl.getUniformLocation(program.program, "pixelScale"), rb.width, rb.height);

                bias.bind(0);
                gl.uniform1i(gl.getUniformLocation(program.program, "bias"), 0);
                gl.uniform2f(gl.getUniformLocation(program.program, "biasScale"), bias.width, bias.height);

                kernel.bind(1);
                gl.uniform1i(gl.getUniformLocation(program.program, "kernel"), 1);
                gl.uniform2f(gl.getUniformLocation(program.program, "kernelScale"), kernel.width, kernel.height);

                inp.bind(2);
                gl.uniform1i(gl.getUniformLocation(program.program, "inp"), 2);
                gl.uniform2f(gl.getUniformLocation(program.program, "inpScale"), inp.width, inp.height);

                const bb = new BatchBuilder();
                for (let n = 0; n < nOutputPlane; n++) {
                    let blockX = Math.floor(n % 16);
                    let blockY = Math.floor(n / 16);
                    //console.log(blockX, blockY);
                    bb.addQuad(blockX * this.blockSize, blockY * this.blockSize, chunkY.width - step, chunkY.height - step, n);
                }

                const vertexData = (new GlBuffer(gl, gl.ARRAY_BUFFER)).uploadFloats(bb.vertices).use();
                const elements = (new GlBuffer(gl, gl.ELEMENT_ARRAY_BUFFER)).uploadShorts(bb.indices).use();

                gl.enableVertexAttribArray(aPos);
                gl.enableVertexAttribArray(aInPos);
                gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 4 * 5, 0);
                gl.vertexAttribPointer(aInPos, 3, gl.FLOAT, false, 4 * 5, 4 * 2);

                //gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                //console.log(bb.indices);
                //console.log(bb.indices.length);
                gl.drawElements(gl.TRIANGLES, bb.indices.length, gl.UNSIGNED_SHORT, 0);
                //console.log(gl.getError());

                elements.dispose();
                vertexData.dispose();

                if (step === 6) {
                    gl.readPixels(0, 0, outWidth, outHeight, gl.RGBA, gl.FLOAT, out);
                }
            });

            inp.dispose();
            inp = outp;
        }
        inp.dispose();

        return Bitmap32.fromFloat(this.blockSize, this.blockSize, out.alphaTo1()).sliceCopy(7, 7, this.blockSize - 7, this.blockSize - 7).yCbCrToRgba();
    }

    constructor() {
        this.steps = null;
        this.vert = null;
        this.frag = null;
        this.programs = null;
        this.biases = null;
        this.kernels = null;
        //this.blockSize = 300;
        //this.blockSize = 196;
        this.blockSize = 256;
        //this.blockSize = 96;
        //this.blockSize = 64;
        //this.blockSize = 16;
        //this.blockSize = 48;
    }

    async init(model) {
        // let up2 = await readJson('models/scale2.0x_model.json');
        // let denoise1 =  await readJson('models/noise1_model.json');
        // let denoise2 =  await readJson('models/noise2_model.json');
        // let denoise3 =  await readJson('models/noise3_model.json');
        
        // console.log(up2, denoise1, denoise2, denoise3);

        // this.steps = up2;
        this.steps = await readJson(model);
        //console.log(model);
        this.vert = await readText('waifu2x.vert');
        this.frag = await readText('waifu2x.frag');

        let vert = this.vert;
        let frag = this.frag;

        const webglCanvas = createCanvas(32, 32);
        const gl = webglCanvas.getContext('webgl');
        window.gl = gl;

        gl.getExtension("WEBGL_color_buffer_float")
        gl.getExtension('OES_texture_float');

        this.programs = this.steps.map((v) => {
            let prefix = `const int NUM_INPUTS = ${v.nInputPlane};`;
            prefix += `const int BLOCK_SIZE = ${this.blockSize};`;
            return new GlProgram(gl, `${prefix}${vert}`, `${prefix}${frag}`);
        });

        this.biases = this.steps.map((v) => new GlTexture2d(gl).setFloatData(new Float32Array(v.bias)));
        this.kernels = this.steps.map((v) => {
            const vInputPlane = v.nInputPlane;
            const vOutputPlane = v.nOutputPlane;

            const width = vInputPlane * 3;
            const height = vOutputPlane * 3;

            const out = new Float32Array(width * height);
            for (let i = 0; i < vOutputPlane; i++) {
                const I = v.weight[i];

                const mY = i * 3;

                for (let j = 0; j < vInputPlane; j++) {
                    const J = I[j];

                    const mX = j * 3;

                    for (let y = 0; y < 3; y++) {
                        const Y = J[y];
                        for (let x = 0; x < 3; x++) {
                            const vv = Y[x];
                            const px = mX + x;
                            const py = mY + y;

                            out[py * width + px] = vv;
                        }
                    }
                }
            }
            return new GlTexture2d(gl).setFloatData(new Float32Array(out), vInputPlane * 3, vOutputPlane * 3)
        });
        gl.clearColor(1, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}


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
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS) ) throw new Error(gl.getProgramInfoLog(this.program));
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
        const gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = data;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return this;
    }

    setFloat4Data(width, height, data) {
        const gl = this.gl;
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
        const gl = this.gl;
        this.width = width;
        this.height = height;
        this.data = data;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.FLOAT, data);
        return this;
    }

    setEmptyFloat4(width, height) {
        this.width = width;
        this.height = height;
        this.data = null;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, null);
        return this;
    }

    setEmptyRgba(width, height) {
        this.width = width;
        this.height = height;
        this.data = null;
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return this;
    }

    bind(unit = 0) {
        const gl = this.gl;
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
        const gl = this.gl;
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

//class Bitmap32Float {
//    constructor(width, height, data = null) {
//        if (data == null)// data = new Float32Array(width * height * 4);
//        this.width = width;
//        this.height = height;
//        this.data = data;
//    }
//}

