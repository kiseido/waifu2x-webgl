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
        console.log(this);
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
        return await (await fetch(path)).json();
    }

    async function readText(path) {
        return await (await fetch(path)).text();
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

    function println(msg) {
        console.log(msg);
    }

    async function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(() => { resolve(); }, ms);
        });
    }