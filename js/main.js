/**
 * @type {WaifuNx}}
 */
var waifuNx;

function init(event) {
    if (document.readyState != 'complete') {
        return;
    }
    inputCanvas = document.querySelector("canvas.input");
    outputCanvas = document.querySelector("canvas.output");
    inputImage = document.querySelector("img.input");

    waifuNx = new WaifuNx(inputCanvas, outputCanvas);

    waifuNx.onStatusUpdate = function (message, condition) {
        let statusElem = document.querySelector("#status");
        statusElem.dataset.condition = condition;
        statusElem.textContent = message;
    };
}

async function upscaleBegin(event) {
    event.preventDefault();

    let form = event.target;

    await waifuNx.init();
    waifuNx.startWaifu();
}
function updateImage(event) {
    console.log("image", event);
    let fr = new FileReader();
    let imageInput = event.target;
    let file = imageInput.files[0];

    /** @param ProgressEvent **/
    fr.onload = function (event) {
        console.log(file, arguments);
        let image = document.createElement('img');
        image.dataset.fileName = file.name;
        image.dataset.type = file.type;
        image.src = fr.result;
        setTimeout(function () {
            waifuNx.InputFromImage(image);
            // copyImageToCanvas(image, canvas);
        });
    }

    fr.readAsDataURL(file);
}
function copyOutputToInput(event) {
    let inCanvas = waifuNx.inputCanvas;
    let outCanvas = waifuNx.outputCanvas;
    let inCTX = inCanvas.getContext('2d');
    // let outCTX = outCanvas.getContext('2d');
    inCanvas.width = outCanvas.width;
    inCanvas.height = outCanvas.height;
    inCTX.drawImage(outCanvas, 0, 0);
}
function scale(event, scale) {
    let inCanvas = waifuNx.inputCanvas;

    let width = Math.ceil(inCanvas.width * scale);
    let height = Math.ceil(inCanvas.height * scale);

    let offScreen = document.createElement('canvas');
    offScreen.width = width;
    offScreen.height = height;

    let offCtx = offScreen.getContext('2d');
    offCtx.scale(scale, scale);
    offCtx.drawImage(inCanvas, 0, 0);

    inCanvas.width = width;
    inCanvas.height = height;

    let inCTX = inCanvas.getContext('2d');
    inCTX.drawImage(offScreen, 0, 0);
}
function modeChanged(event) {
    console.log('modechanded', event);
    let select = event.target;
    let option = event.target.selectedOptions[0];
    let optFile = option.value;
    
    if (optFile != "customFile") {
        waifuNx.setmodel(optFile);
    } else {
        let e = document.createElement('input');
        e.type = 'file';
        e.accept = ".json";
        e.onchange = function () {
            console.log(e.files);
            if (e.files.length > 0) {
                let fr = new FileReader();
                let file = e.files[0];

                /** @param ProgressEvent **/
                fr.onload = function (event) {
                    console.log('model load',file, arguments);

                    waifuNx.addModel(file.name, JSON.parse(fr.result));
                    waifuNx.setmodel(file.name);

                    let option = document.createElement('option');
                    option.value = file.name;
                    option.text = file.name;

                    select.options.add(option);
                    select.selectedIndex = select.options.length - 1;
                }

                fr.readAsText(file);
            }
        };
        e.click();

    }
}
document.onreadystatechange = init;