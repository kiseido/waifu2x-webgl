
// https://gist.github.com/adrianseeley/f768fd7a3aab2370eafc
async function scale(image, canvas, option) {
    console.log("scale", arguments);

    if (canvas.dataset.opstatus != undefined) {
        console.log('await other canvas op stop', canvas.dataset.opstatus);
        canvas.dataset.opstatus = 'stop'
        let sanitycheck = 0;
        while (canvas.dataset.opstatus != undefined && sanitycheck < 10000) {
            await sleep(0);
        }
    }

    const ctx = mycanvas.getContext('2d');

    const width = canvas.width;
    const height = canvas.height;

    //console.log('' + kernels[0].data);
    //console.log(kernels);
    //program.aVertexPosition  = gl.getAttribLocation(program, 'aVertexPosition');
    //gl.enableVertexAttribArray();

    //setInterval(function() {

    //tex.setFloatData(2, 1, new Float32Array([1, 1, 1, 1, 0, 0, 0, 0]));

    // const img2xBase = image.toCanvas().scale(2, 2).toBitmap32();

    

    const imgBase = canvas.toBitmap32();
    const img2x = imgBase.sliceCopy(0, 0, imgBase.width, imgBase.height);

    {
        let offScreen = document.createElement('canvas');
        offScreen.width = width;
        offScreen.height = height;
        let offCtx = offScreen.getContext('2d');
        offCtx.drawImage(canvas, 0, 0);

        //myctx.globalCompositeOperation = 'copy';
        ctx.globalAlpha = 0.5;
        // let imgdata = canvas.toBitmap32();
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(offScreen, 0, 0);
        ctx.globalAlpha = 1.0;
        //const out = new Float32Array(128 * 128 * 4);
    }

    let waifu2x = new Waifu2x();



    
    await waifu2x.init(option);

    const blockSizeNP = waifu2x.blockSize - 14;

    const xchunks = Math.ceil(width / blockSizeNP);
    const ychunks = Math.ceil(height / blockSizeNP);

    const startStart = Date.now();

    canvas.dataset.opstatus = 'running';
    setStatus("Running");

    for (let yc = 0; yc < ychunks; yc++) {
        for (let xc = 0; xc < xchunks; xc++) {
            if (canvas.dataset.opstatus == 'stop') {
                delete canvas.dataset.opstatus;
                setStatus("Stopped");
                console.log("canvas op stopped");
                return;
            }
            const start = Date.now();
            let xx = xc * blockSizeNP;
            let yy = yc * blockSizeNP;

            let w= Math.min(width, xx + blockSizeNP + 14);
            let h = Math.min(height, yy + blockSizeNP + 14)

            const chunk = img2x.sliceCopy(xx - 7, yy - 7, w + 7, h + 7);

            //console.log(xx, yy);

            //console.log(img2x);


            // const start = Date.now();
            const res = waifu2x.waifu2x(chunk);

            ctx.drawImage(res.toCanvas(), xx, yy);
            const end = Date.now();
            console.log(`chunk (${xc}, ${yc}): ${end - start}`);
            await sleep(0);
        }
    }

    delete canvas.dataset.opstatus;
    setStatus("Completed");

    const endEnd = Date.now();
    console.log('totalTime: ', endEnd - startStart);

    //}, 100);

    //document.body.appendChild(webglCanvas);

    println("done!");
    //const img = image.toCanvas().scale(2, 2).toBitmap32().sliceCopy(-7, -7, image.width * 2 + 7, image.height * 2 + 7).toCanvas();
    //ImageUtils.scaleImageData(data)
    //console.log(data);
    //canvas.getImageData(0, 0, image.width)
}

function copyImageToCanvas(image, canvas) {
    let ctx = mycanvas.getContext('2d');
    let img2xBase = image.toCanvas().scale(2, 2).toBitmap32();
    const img2x = img2xBase.sliceCopy(0, 0, img2xBase.width, img2xBase.height);

    canvas.width = img2xBase.width;
    canvas.height = img2xBase.height;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}py`;

    ctx.drawImage(img2x.toCanvas(), 0, 0);
}