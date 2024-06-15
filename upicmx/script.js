var durpieza_enseg = 350;
var composicion = []; //guarda puntos graficos
var composicionTF = []; //guarda conversion a valores Tiempo frecuencia
var gestoActualT = [];
var gestoActualF = [];
var gestoActual;
var PAUSASON = 50;
var pasado = 0;
var ultimoPunto = -1;
var tocando = false;
var cuantoTiempoVa = 0;
var tipoDeSonificacion = "Parametrica";
var osciladores = [];

var botPA = document.getElementById("botonPA");
var botTipo = document.getElementById("botonTipo");

var notaAguda = 50
var notaGrave = 20
var malla = false

function setup() {
  createCanvas(800, 600);
  pixelDensity(1);
  //noLoop();
}

//
function draw() {
  if (tocando) cuantoTiempoVa += deltaTime;
  //console.log(cuantoTiempoVa);
  background(180);
  if (malla) grid();
  if (mouseIsPressed &&
    estaDentroDeCanvas() &&
    mouseX > ultimoPunto) {
    gestoActual.trazo.push(new Punto(mouseX, mouseY));
    ultimoPunto = mouseX;
  }
  pintaComposicion();
  if (tocando) {
    pintaPosActual();
  }

  //esta seccion pausa o hace un grid temporal para no hacer tantos sonidos encimados
  if (tocando && tipoDeSonificacion == "Plastica") {
    if (cuantoTiempoVa - pasado > PAUSASON) {
      console.log("esto si pasa " + cuantoTiempoVa);
      sonoficarPlastica();
      pasado = cuantoTiempoVa;
    }
  }
}

function changeGrid() {
  malla = !malla
}

function grid() {
  textSize(15);
  stroke(0, 0, 255, 75);
  fill(50, 120, 50);
  var lineHor = width / NumLin();
  var lineVert = height / (notaAguda - notaGrave);
  for (i = 0; i < width; i = i + lineHor) {
    stroke(75, 75, 75, 75);
    strokeWeight(1.5)
    line(i, 0, i, height);
    noStroke()
    text(floor(pixelATiempo(i)), i + 4, 16);
  }
  for (y = notaGrave; y < height; y = y + lineVert * 6) {
    var nota = map(y, 0, height, notaAguda, notaGrave)
    stroke(75, 75, 75, 75);
    strokeWeight(0.5)
    line(0, y, width, y);
    noStroke();
    text(floor(nota), 4, y + 15);
  }
}

function NumLin() {
  if (durpieza_enseg < 60) {
    return 6
  } else if (durpieza_enseg < 180) {
    return 10
  } else if (durpieza_enseg < 300) {
    return 15
  } else
    return 20
}

function tocaOApagaPieza() {
  if (tocando) {
    //console.log("se pare");
    botPA.innerText = "PRENDE";
    if (tipoDeSonificacion == "Parametrica") {
      apagaParametrica();
    }
    //noLoop();
  } else {
    //console.log("empieza a tocar");
    botPA.innerText = "APAGA";
    //loop();
    cuantoTiempoVa = 0;
    pasado = 0;
    if (tipoDeSonificacion == "Parametrica") {
      sonificarParametrica();
    }
  }
  tocando = !tocando; //invierte el estado lógico
  //console.log("tocando " + tocando);

}
//cambiamos el tipo de sonificación y el texto interno del segundo botón
function cambiarTipo() {
  if (tipoDeSonificacion == "Plastica") {
    tipoDeSonificacion = "Parametrica";
    botTipo.innerHTML = "SOY Parametrica";
  }

  else {
    tipoDeSonificacion = "Plastica";
    botTipo.innerHTML = "SOY Plastica";
  }
}

//esta seccion nos arroja un booleano que utilizamos en la función draw para saber si estamos dentro del canvas y por lo tanto que esto forme parte de las condiciones para ".pushear" gestoActual.trazo
function estaDentroDeCanvas() {
  if (mouseY > 0 && mouseY < height && mouseX > 0 && mouseX < width)
    return true;
  else return false;
}

//esta seccion apaga la pieza al terminar la duracion
if (cuantoTiempoVa > durpieza_enseg * 1000) {
  botPA.innerText = "PRENDE";
  tocando = false;
}

function pintaComposicion() {
  composicion.forEach(gesto => gesto.pinta());
}

function sonoficarPlastica() {
  console.log("estoy tocando ")
  loadPixels();
  var filasConNegro = []
  var frequencias = []
  var timeActualPix = int(min(tiempoApixel() + 3, width));
  for (var cont = 0; cont < height; cont++) {
    var pixCanalRojo = pixels[(cont * width + timeActualPix) * 4 + 0];
    if (pixCanalRojo == 0) {
      filasConNegro.push(height - cont);
    }
  }
  frequencias = filasConNegro.map(pixNegro => {
    let midi = map(pixNegro, 0, height, notaGrave, notaAguda); //nueva escala temperada
    //utlizar midi2freq
    return midi2freq(midi);
  });
  //console.log(timeActualPix + " " + filasConNegro + " " + frequencias);
  for (var i = 0; i < frequencias.length; i++) {
    var osc = new p5.Oscillator(frequencias[i], 'sine');
    osc.amp(0);
    osc.start();
    osc.amp(0.1, 0.05);
    osc.amp(0, 0.1, 0.05);
    osc.stop(0.2);
  }
}

function sonificarParametrica() {
  console.log("SE LLAMO LA PARAMETRICA");
  //console.log("Trazos" + composicionTF.length);
  destruyeOsc();
  osciladores = [];
  for (var i = 0; i < composicionTF.length; i++) {
    var gestoTMP = composicionTF[i];
    var osc = new p5.Oscillator(composicionTF[i][1][0], 'sine');
    osc.start(composicionTF[i][0][0]);
    osc.amp(0.0, 0, composicionTF[i][0][0]);
    osc.amp(0.1, 0.1, composicionTF[i][0][0]);
    for (var j = 1; j < gestoTMP[0].length; j++) {
      var tTmp = composicionTF[i][0][j]; //tiempo
      var fTmp = composicionTF[i][1][j]; //freq
      var tTmpAnterior = composicionTF[i][0][j - 1]; //freq
      osc.freq(fTmp, tTmp - tTmpAnterior, tTmpAnterior);
    }
    var indxtUltimo = gestoTMP[0].length - 1; //aggara el ultimo del arreglo
    osc.amp(0, 0.1, gestoTMP[0][indxtUltimo] - 0.1);
    osc.stop(gestoTMP[0][indxtUltimo]);
    osciladores.push(osc);
  }
}

function apagaParametrica() {
  //destruyeOsc();
  osciladores.forEach(actoscl => {
    actoscl.amp(0, 0.1, 0);
    actoscl.stop(1);
  });
}

function destruyeOsc() {
  osciladores.forEach(actoscl => {
    actoscl.disconnect();
  });
}

function pintaPosActual() {
  stroke(255, 0, 0, 100);
  strokeWeight(1);
  var timeActualPix = tiempoApixel();
  line(timeActualPix, 0, timeActualPix, height);
}

function tiempoApixel() {
  return map(cuantoTiempoVa, 0, durpieza_enseg * 1000, 0, width);
}

function pixelATiempo(valorX) {
  return map(valorX, 0, width, 0, durpieza_enseg);
}


function mousePressed() {
  if (estaDentroDeCanvas()) {
    gestoActual = new Gesto();
    ultimoPunto = -1;
    composicion.push(gestoActual);
  }
}

function mouseReleased() {
  if (estaDentroDeCanvas()) {
    gestoActualT = [];
    gestoActualF = [];
    for (var i = 0; i < gestoActual.trazo.length; i++) {
      var nuevaX = pixelATiempo(gestoActual.trazo[i].x);
      gestoActualT.push(nuevaX);
      var midiY = map(gestoActual.trazo[i].y, 0, height, 100, 20); //hacemos la inversión de frecuencias
      var nuevaY = midi2freq(midiY);
      gestoActualF.push(nuevaY);
    }
    //console.log(gestoActualT);
    //console.log(gestoActualF);
    composicionTF.push([gestoActualT, gestoActualF]);
    //console.log("se agrega nuevo gesto");
  }
}

function limpia() {
  composicion = []
  composicionTF = []
  gestoActualT = []
  gestoActualF = []
}

//func midi2freq
function midi2freq(midi) {
  return Math.pow(2, (midi - 69) / 12) * 440;
}


function salvaPieza() {
  //console.log("sisis");

  var compocomotexto = JSON.stringify({
    "composicion": composicion,
    "composicionTF": composicionTF,
    "durpieza_enseg": durpieza_enseg
  });

  var bb = new Blob([compocomotexto], { type: 'text/plain' });
  var a = document.createElement('a');
  a.download = 'download.txt';
  a.href = window.URL.createObjectURL(bb);
  a.click();
}

function cargaPieza(contenidoNuevo) {
  var compoNueva = JSON.parse(contenidoNuevo);
  limpia();
  //console.log("si limpio");
  composicionCruda = compoNueva.composicion;
  //console.log(composicionCruda);
  composicionCruda.forEach(unTrazo => {
    //console.log(unTrazo.trazo)
    var ge = new Gesto();
    composicion.push(ge);
    unTrazo.trazo.forEach(unpunto => {
      //console.log(unpunto);
      ge.trazo.push(new Punto(unpunto.x, unpunto.y));
    });
  });


  composicionTF = compoNueva.composicionTF;
  durpieza_enseg = compoNueva.durpieza_enseg;
  gestoActualT = []
  gestoActualF = []
}

function readSingleFile(e) {
  var file = e.target.files[0];
  if (!file) {
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var contents = e.target.result;
    //console.log(contents);
    cargaPieza(contents);
  };
  reader.readAsText(file);
}

document.getElementById('file-input')
  .addEventListener('change', readSingleFile, false);


class Gesto {
  constructor() {
    this.trazo = []
  }

  pinta() {
    stroke(0);
    strokeWeight(2);
    for (var i = 0; i < this.trazo.length - 1; i++) {
      //ellipse(this.trazo[i].x, this.trazo[i].y, 5);
      line(this.trazo[i].x, this.trazo[i].y, this.trazo[i + 1].x, this.trazo[i + 1].y)
    }
  }
}

class Punto {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}