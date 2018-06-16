class WaifuNx {
    constructor(inputCanvas, outputCanvas) {
        this.inputCanvas = inputCanvas;
        this.outputCanvas = outputCanvas;
        this.scaleFactor = 1.0;
        this.noiseReduce = 0;

        this.models = [];
        this.scaleModel = null;

        this.blockSize = 256;
        this.steps = null;
        this.programs = null;
        this.biases = null;
        this.kernels = null;

        this.isReady = false;
    }

    async startWaifu() {
        if(this.isReady != true) {
            throw new Error('WaifuNx not yet setup!');
        }
        let inCanvas = this.inputCanvas;
        let outCanvas = this.outputCanvas;

        let inctx = inCanvas.getContext('2d');
        let outctx = outCanvas.getContext('2d');

        if (outputCanvas.dataset.opstatus != undefined) {
            console.log('await other canvas op stop', outputCanvas.dataset.opstatus);
            this.statusUpdate("Stopping old session...", 'running');
            outputCanvas.dataset.opstatus = 'stop'
            let sanitycheck = 0;
            while (outputCanvas.dataset.opstatus != undefined && sanitycheck < 10000) {
                await sleep(0);
            }
        }

        let img2xBase = inCanvas.scale(2, 2).toBitmap32();
        let img2x = img2xBase.sliceCopy(0, 0, img2xBase.width, img2xBase.height);

        outCanvas.width = img2xBase.width;
        outCanvas.height = img2xBase.height;

        outctx.drawImage(img2x.toCanvas(), 0, 0);

        const width = outCanvas.width;
        const height = outCanvas.height;

        //console.log('' + kernels[0].data);
        //console.log(kernels);
        //program.aVertexPosition  = gl.getAttribLocation(program, 'aVertexPosition');
        //gl.enableVertexAttribArray();

        //setInterval(function() {

        //tex.setFloatData(2, 1, new Float32Array([1, 1, 1, 1, 0, 0, 0, 0]));

        // const img2xBase = image.toCanvas().scale(2, 2).toBitmap32();


        {
            let offScreen = document.createElement('canvas');
            offScreen.width = width;
            offScreen.height = height;
            let offCtx = offScreen.getContext('2d');
            offCtx.drawImage(outCanvas, 0, 0);

            //myctx.globalCompositeOperation = 'copy';
            outctx.globalAlpha = 0.5;
            // let imgdata = canvas.toBitmap32();
            outctx.clearRect(0, 0, width, height);
            outctx.drawImage(offScreen, 0, 0);
            outctx.globalAlpha = 1.0;
            //const out = new Float32Array(128 * 128 * 4);
        }

        // let waifu2x = new Waifu2x();

        const blockSizeNP = this.blockSize - 14;

        const xchunks = Math.ceil(width / blockSizeNP);
        const ychunks = Math.ceil(height / blockSizeNP);

        const startStart = Date.now();

        outCanvas.dataset.opstatus = 'running';
        this.statusUpdate("Running",'running');

        for (let yc = 0; yc < ychunks; yc++) {
            for (let xc = 0; xc < xchunks; xc++) {
                if (outCanvas.dataset.opstatus == 'stop') {
                    delete outCanvas.dataset.opstatus;
                    this.statusUpdate("Stopped");
                    console.log("canvas op stopped");
                    return;
                }
                const start = Date.now();
                let xx = xc * blockSizeNP;
                let yy = yc * blockSizeNP;

                let w = Math.min(width, xx + blockSizeNP + 14);
                let h = Math.min(height, yy + blockSizeNP + 14)

                const chunk = img2x.sliceCopy(xx - 7, yy - 7, w + 7, h + 7);

                //console.log(xx, yy);

                //console.log(img2x);


                // const start = Date.now();
                const res = this.processChunk(chunk);

                outctx.drawImage(res.toCanvas(), xx, yy);
                const end = Date.now();
                console.log(`chunk (${xc}, ${yc}): ${end - start}`);
                await sleep(0);
            }
        }

        delete outCanvas.dataset.opstatus;

        const endEnd = Date.now();

        this.statusUpdate("Completed in " + (endEnd - startStart) + "ms.", 'stopped');
        console.log('totalTime: ', endEnd - startStart);
    }

    async init(model) {
        console.log('WaifuNx init',arguments);
        let webglCanvas = createCanvas(32, 32);
        let gl = webglCanvas.getContext('webgl');
        this.gl = gl;

        gl.getExtension("WEBGL_color_buffer_float")
        gl.getExtension('OES_texture_float');

        let vert = await readText('waifu2x.vert');
        let frag = await readText('waifu2x.frag');

        this.vert = vert;
        this.frag = frag;

        this.steps = model;

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
        this.isReady = true;
    }

    processChunk(chunk) {
        let gl = this.gl;
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

    setScaleModel(parsedJsonModel) {
        this.scaleModel = parsedJsonModel;
    }

    addModel(parsedJsonModel) {

    }

    InputFromImage(imageElement) {
        let ctx = inputCanvas.getContext('2d');
        let imgData = imageElement.toCanvas();

        inputCanvas.width = imgData.width;
        inputCanvas.height = imgData.height;

        ctx.drawImage(imgData, 0, 0);
    }

    stopWaifu() {
        if (this.outputCanvas.dataset.opstatus)
            this.outputCanvas.dataset.opstatus = 'stop';
    }

    statusUpdate() {
        this.onStatusUpdate.apply(this, arguments);
    }

    onStatusUpdate(message, condition) {
        console.log(message);
    }
}