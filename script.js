import * as THREE from 'three';
import {
  OrbitControls
} from 'OrbitControls';
import Stats from 'Stats';
import {
  GUI
} from 'GUI';

const BORDE = 400;

let recController;
let settings = {
  'mute audio': true,
  'volumen': 0.5,
  'cant_agentes': 5,
  'alineamiento': 0.2,
  'cohesion': 0.2,
  'separacion': 0.5,
  'syn_distancia': 2.8,
  'despierto': 0.5,
  'vol_min': 0,
  'vel_max': 1,
  'fuerza_max': 0.1,
  'bordes': true,
  'inicia grabacion': function() { grabacion() },
  'descarga': function() { download() }
}

let ALINEAMIENTO_DISTANCE = BORDE * settings.alineamiento;
let COHESION_DISTANCE = BORDE * settings.cohesion;
let SEPARATION = BORDE * settings.separacion;
let SYNC_DISTANCIA = BORDE * settings.syn_distancia;

//let DESPIERTO = settings.despierto;

//let MAX_SPEED = settings.vel_max;
//let MAX_FORCE = settings.fuerza_max;

const SIZE = 5;
const RAND_RANGE_VEL = 1;

const CANT_PLANOS_MAX = 4;

//const PASO_FASE = 0.01;

let audioContext, muteGain, mainGain, recorderNode;
let audioLoader;
let datasoundL, datasoundR, recLength;
let isRecording = false;

let numChannels = 2;
let sampleRate = 44100;

let url = "none";

let frameRate;

//////////////////////////////////
//////////////////////////////////
///funcion de write wav
//////////////////////////////////
//////////////////////////////////
function grabacion() {
  isRecording = !isRecording;
  if (!isRecording) {
    stopRec();
    recController.name("inicia grabacion")
  }
  else {
    initRec();
    recController.name("parar grabacion")
  }
}

function download() {
  if (url != "none") {
    const a = document.createElement('a');
    a.href = url;
    a.download = "composicion.wav";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  else {
    window.alert("aún no hay grabacion")
  }
}

function generateURL(blob) {
  url = (window.URL || window.webkitURL).createObjectURL(blob);
}

function exportWAV(recBuffers, recLength) {
  var buffers = [];
  for (var channel = 0; channel < numChannels; channel++) {
    buffers.push(mergeBuffers(recBuffers[channel], recLength));
  }
  var interleaved = void 0;
  if (numChannels === 2) {
    interleaved = interleave(buffers[0], buffers[1]);
  } else {
    interleaved = buffers[0];
  }
  var dataview = encodeWAV(interleaved);
  var audioBlob = new Blob([dataview], { type: "audio/wav" });
  generateURL(audioBlob);
}

function mergeBuffers(recBuffers, recLength) {
  var result = new Float32Array(recLength);
  var offset = 0;
  for (var i = 0; i < recBuffers.length; i++) {
    result.set(recBuffers[i], offset);
    offset += recBuffers[i].length;
  }
  return result;
}

function interleave(inputL, inputR) {
  var length = inputL.length + inputR.length;
  var result = new Float32Array(length);

  var index = 0,
    inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function floatTo16BitPCM(output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(samples) {
  var buffer = new ArrayBuffer(44 + samples.length * 2);
  var view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 4, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return view;
}

//////////////////////////////////
//////////////////////////////////
///funcion de audio
//////////////////////////////////
//////////////////////////////////
async function audioInit() {
  if (!audioContext) {
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();

      audioLoader = new THREE.AudioLoader();
      const convolver = audioContext.createConvolver();
      audioLoader.load(
        'Echo.wav',
        function(audioBuffer) {
          console.log("audio loeaded");
          convolver.buffer = audioBuffer;
        }
      );

      mainGain = audioContext.createGain();
      muteGain = audioContext.createGain();
      mainGain.connect(muteGain);

      muteGain.connect(convolver);
      convolver.connect(audioContext.destination);

      mainGain.gain.value = settings.volumen;
      muteGain.gain.value = 0;

      await audioContext.audioWorklet.addModule('./recorderWorkletProcessor.js')

      const channels = 2
      recorderNode = new AudioWorkletNode(
        audioContext,
        'recorder-worklet', {
        parameterData: {
          numberOfChannels: channels
        }
      });

      //Connect your source
      convolver.connect(recorderNode);
      recorderNode.connect(audioContext.destination);

      //Register worklet events
      recorderNode.port.onmessage = (e) => {
        const data = e.data;
        switch (data.eventType) {
          case "data":
            // process pcm data; encode etc
            const audioData = data.audioBuffer;
            const bufferSize = data.bufferSize;
            datasoundL.push(audioData[0]);
            datasoundR.push(audioData[1]);
            recLength += bufferSize;
            break;
          case "stop":
            console.log("termino grabacion " + recLength);
            exportWAV([datasoundL, datasoundR], recLength);
            break;
        }
      };

    } catch (e) {
      alert('Web Audio API is not supported in this browser');
    }
    console.log(audioContext);
  }
}

function initRec() {
  datasoundL = [];
  datasoundR = [];
  recLength = 0;
  let isRec = recorderNode.parameters.get('isRecording')
  isRec.setValueAtTime(1, audioContext.currentTime);
}

function stopRec() {
  let isRec = recorderNode.parameters.get('isRecording')
  isRec.setValueAtTime(0, audioContext.currentTime);
}

function muteAudio(muted) {
  if (!muted) {
    audioContext.resume();
    recController.enable();
    downloadController.enable();
    muteGain.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.1);
  } else {
    muteGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
  }
}

function mainVolChange() {
  mainGain.gain.value = settings.volumen;
}

class FM {
  constructor() {
    this.freq = 440;
    this.indexM = 5;
    this.modfreq = this.freq * this.indexM;
    this.ampMod = 250;
    this.stereo = 0;

    this.now = audioContext.currentTime;

    this.carrier = audioContext.createOscillator();
    this.carrier.type = 'sine';

    this.mod1 = audioContext.createOscillator();
    this.mod1.type = 'sine';

    this.mod1gain = audioContext.createGain();
    this.mod1gain.gain.value = this.ampMod;

    this.vol = audioContext.createGain();
    this.vol.gain.setValueAtTime(0, audioContext.currentTime);

    this.vol2 = audioContext.createGain();
    this.vol2.gain.setValueAtTime(0, audioContext.currentTime);

    this.mod1.connect(this.mod1gain);
    this.mod1gain.connect(this.carrier.frequency); //ojo magia
    this.carrier.connect(this.vol);
    this.carrier.connect(this.vol2);

    this.panNode = audioContext.createStereoPanner();
    this.panNode.pan.value = this.stereo;

    this.vol.connect(this.panNode);
    this.vol2.connect(this.panNode);
    this.panNode.connect(mainGain);

    this.carrier.start();
    this.mod1.start();
  }

  muere() {
    this.vol.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.05);
    this.carrier.stop(audioContext.currentTime + 0.05);
    this.mod1.stop(audioContext.currentTime + 0.05);
  }

  updateF(freq) {
    if (!settings["mute audio"]) {
      this.freq = freq;
      this.modfreq = this.freq * this.indexM;
      this.carrier.frequency.setValueAtTime(this.freq, audioContext.currentTime);
      this.mod1.frequency.setValueAtTime(this.modfreq, audioContext.currentTime);
    }
  }

  updateV(vol) {
    if (!settings["mute audio"]) {
      this.vol.gain.setValueAtTime(vol, audioContext.currentTime);
    }
  }

  updateV2(vol) {
    if (!settings["mute audio"]) {
      this.vol2.gain.setValueAtTime(vol, audioContext.currentTime);
    }
  }

  updateV2envelope(vol, dur) {
    if (!settings["mute audio"]) {
      //acortamos dur para no hacer un overlap de las envolventes
      this.vol2.gain.setValueCurveAtTime([0, vol, vol, vol, 0], audioContext.currentTime, dur * 0.8);
    }
  }

  updateAMPMod(vol) {
    if (!settings["mute audio"]) {
      this.mod1gain.gain.setValueAtTime(vol, audioContext.currentTime);
    }
  }

  updateIM(indexMod) {
    this.indexM = indexMod;
    this.modfreq = this.freq * this.indexM;
    this.mod1.frequency.setValueAtTime(this.modfreq, audioContext.currentTime);
  }

  updateStereo(panning) {
    this.stereo = panning;
    this.panNode.pan.setValueAtTime(this.stereo, audioContext.currentTime);
  }
}

//////////////////////////////////
//////////////////////////////////
//// Clase Flock
//////////////////////////////////
//////////////////////////////////
class Flock {
  constructor() {
    // Un arreglo para todos los boids
    this.boids = []; // Inicializar el arreglo
  }

  addBoid(b) {
    this.boids.push(b);
  }

  removeBoid() {
    let herido = this.boids.pop();
    herido.muere();
  }

  run() {
    let bmps = [];
    for (let i = 0; i < this.boids.length; i++) {
      this.boids[i].run(this.boids); // Pasar la lista entera de boids a cada boid de forma individual
      bmps.push(this.boids[i].paso);
    }
  }
}

//////////////////////////////////
//////////////////////////////////
//// Clase Boid
//////////////////////////////////
//////////////////////////////////
// Métodos para Separación, Cohesión, alineamiento
class Boid {
  constructor(x, y, z) {
    this.acceleration = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(
      getRandomArbitrary(-RAND_RANGE_VEL, RAND_RANGE_VEL),
      getRandomArbitrary(-RAND_RANGE_VEL, RAND_RANGE_VEL),
      getRandomArbitrary(-RAND_RANGE_VEL, RAND_RANGE_VEL));
    this.position = new THREE.Vector3(x, y, z);
    this.r = SIZE;

    this.paso = getRandomArbitrary(0.01, 0.01); //(0.005, 0.01);
    this.fase = Math.random(); //% 0.05;

    this.estado = "APAGADO";
    this.ciclo = "VIEJO";

    this.realDuration = frameRate * 1 / this.paso;

    // Dibuja un triángulo rotado en la dirección de la velocidad
    //let theta = this.velocity.heading() + radians(90);
    this.geometry = new THREE.SphereGeometry(this.r, 16, 16);
    this.material = new THREE.MeshPhongMaterial({ //MeshBasicMaterial
      color: new THREE.Color().setHSL(0.1, 0, 0.5),
    });

    this.sphere = new THREE.Mesh(this.geometry, this.material);

    this.sphere.position.x = this.position.x;
    this.sphere.position.y = this.position.y;
    this.sphere.position.z = this.position.z;

    this.sound = new FM();

    scene.add(this.sphere);
  }

  muere() {
    scene.remove(this.sphere);
    this.sound.muere();
  }

  run(boids) {
    this.flock(boids);
    this.update();
    this.bpmsync(boids);
    this.syncronization(boids);
    this.borders();
    this.render();
  }

  applyForce(force) {
    // Posibilidad de agregar masa aquí si queremos A = F / M
    this.acceleration.add(force);
  }

  // Acumular una nueva aceleración cada vez basado en tres reglas
  flock(boids) {
    //console.log(boids);
    let sep = this.separate(boids); // Separación
    let ali = this.align(boids); // Alineamiento
    let coh = this.cohesion(boids); // Cohesión
    //// Dar un peso arbitrario a cada fuerza
    sep.multiplyScalar(1.5);
    ali.multiplyScalar(1.0);
    coh.multiplyScalar(1.0);
    //// Suma los vectores de fuerza a la aceleración
    this.applyForce(sep);
    this.applyForce(ali);
    this.applyForce(coh);

  }

  // Un método que calcula y aplica una fuerza de viraje hacia una posición objetivo
  // VIRAJE = DESEADO - VELOCIDAD
  seek(target) {
    // Un vector apuntando desde la ubicación hacia el objetivo
    let desired = target.clone();
    desired.sub(this.position);
    // Normalizar deseado y escalar según velocidad máxima
    desired.normalize();
    desired.multiplyScalar(settings.vel_max);
    // Viraje = Deseado - Velocidad
    let steer = desired.clone();
    steer.sub(this.velocity);
    steer = limit(steer, settings.fuerza_max); // Limita al máximo de fuerza de viraje
    //steer.clamp(steer, new THREE.Vector3(settings.fuerza_max,settings.fuerza_max,settings.fuerza_max));
    return steer;
  }

  // Método para actualizar ubicación
  update() {
    // Refrescar velocidad
    this.velocity.add(this.acceleration);
    // Limitar velocidad
    this.velocity = limit(this.velocity, settings.vel_max);
    //this.velocity.clamp(this.velocity, new THREE.Vector3(settings.vel_max,settings.vel_max,settings.vel_max));
    this.position.add(this.velocity);
    // Resetear acceleración a 0 en cada ciclo
    this.acceleration.multiplyScalar(0);

    //establece estado DESPIARTO/APAGADO y PULSA en NUEVO
    this.realDuration = frameRate * 1 / this.paso;
    this.fase += this.paso;
    if (this.fase > 1) {
      this.fase = 0;
      this.ciclo = "NUEVO";
    } else {
      this.ciclo = "VIJEO";
    }
    if (this.fase >= settings.despierto) this.estado = "APAGADO";
    else this.estado = "DESPIERTO";

    this.sound.updateF(
      map(this.position.x, -BORDE / 2, BORDE / 2, 300, 1000)
    );

    //esto lo trabajamos el martes urgente urgente urgente
    /*let volVida = 0.3;
    if (this.fase <= settings.despierto) volVida = 0.3;
    else if (this.fase > settings.despierto && this.fase <= settings.despierto + 0.01)
      volVida = map(this.fase, settings.despierto, settings.despierto + 0.1, 0.3, 1);
    else if (this.fase > settings.despierto + 0.01 && this.fase <= settings.despierto + 0.3)
      volVida = map(this.fase, settings.despierto + 0.1, settings.despierto + 0.3, 1, 0.3);
      */

    //volumen de agente se obtiene de 25% minimo + %25 positiondeY + 50% ataque de pulso
    let volumenMinimo = 1 / settings.cant_agentes * settings.vol_min;
    let volPos = map(this.position.y, -BORDE / 2, BORDE / 2, 0.0, 1 / settings.cant_agentes * 0.5);
    this.sound.updateV(volumenMinimo);

    /*
    let ceroAunoEnDespierto = map(this.fase, 0, settings.despierto, 0, 1);
    let adsr = [0.1, 1.0] //momentos en el tiempo de cero a uno
    if (this.estado == "DESPIERTO") {
      let volVida = 0;
      if (ceroAunoEnDespierto > 0 && ceroAunoEnDespierto <= adsr[0]) {
        volVida = map(ceroAunoEnDespierto, 0, adsr[0], 0, 1);
      } else if (ceroAunoEnDespierto > adsr[0] && ceroAunoEnDespierto <= adsr[1]) {
        volVida = map(ceroAunoEnDespierto, adsr[0], adsr[1], 1, 0);
      }
      this.sound.updateV(volumenMinimo + volPos);
    } else { //"apagado"
      this.sound.updateV(volumenMinimo + volPos);
    }*/

    if (this.ciclo == "NUEVO") {
      let tiempoVivo = this.realDuration * settings.despierto;
      this.sound.updateV2envelope(1 / settings.cant_agentes * (1 - settings.vol_min), tiempoVivo);
    }


    this.sound.updateAMPMod(
      map(this.position.z, -BORDE / 2, BORDE / 2, 0, 1000.0)
    );

    this.sound.updateStereo(
      map(this.position.x, -BORDE / 2, BORDE / 2, -0.95, 0.95)
    );
  }

  bpmsync(boids) { //kuramoto
    let sigma = 0;
    for (let i = 0; i < boids.length; i++) {
      sigma += Math.sin(boids[i].paso - this.paso);
    }
    let term2 = 1 / boids.length * sigma;
    this.paso += term2;
  }

  syncronization(boids) {
    if (this.estado == "DESPIERTO") {
      for (let i = 0; i < boids.length; i++) {
        let d = this.position.distanceTo(boids[i].position);
        // Si la distancia es mayor a 0 y menor que una cantidad arbitraria (0 cuando eres tú mismo)
        if ((d > 0) && (d < SYNC_DISTANCIA)) {
          if (boids[i].estado == "DESPIERTO") {
            this.fase += 0.001; //this.paso;
          }
        }
      }
    }
  }

  syncronization2(boids) {
    if (this.estado == "DESPIERTO") {
      let algunoDespierto = false;
      for (let i = 0; i < boids.length; i++) {
        let d = this.position.distanceTo(boids[i].position);
        // Si la distancia es mayor a 0 y menor que una cantidad arbitraria (0 cuando eres tú mismo)
        if ((d > 0) && (d < SYNC_DISTANCIA)) {
          if (boids[i].estado == "DESPIERTO") {
            algunoDespierto = true;
            break;
          }
        }
      }
      if (algunoDespierto) this.fase += 0.05; //this.paso;
    }
  }

  render() {
    this.sphere.position.x = this.position.x;
    this.sphere.position.y = this.position.y;
    this.sphere.position.z = this.position.z;
    if (this.estado == "DESPIERTO") {
      //let cantColor = map(this.fase, settings.despierto, 1, 1, 0);
      let cantColor = map(this.fase, 0, settings.despierto, 1, 0);
      this.sphere.material.color.setHSL(0.1, cantColor, 0.5);
    } else
      this.sphere.material.color.setHSL(0.1, 0, 0.5);
  }

  borders() {
    if (!settings.bordes) {//sin bordes
      if (this.position.x < -BORDE / 2) this.position.x = BORDE / 2;
      if (this.position.x > BORDE / 2) this.position.x = -BORDE / 2;
      if (this.position.y < -BORDE / 2) this.position.y = BORDE / 2;
      if (this.position.y > BORDE / 2) this.position.y = -BORDE / 2;
      if (this.position.z < -BORDE / 2) this.position.z = BORDE / 2;
      if (this.position.z > BORDE / 2) this.position.z = -BORDE / 2;
    }

    else {// Wraparound, salir por un borde y aparecer por el contrario
      if (this.position.x < -BORDE / 2) {
        this.velocity.x *= -1;
        this.position.x = -BORDE / 2;
      }
      if (this.position.x > BORDE / 2) {
        this.velocity.x *= -1;
        this.position.x = BORDE / 2;
      }
      if (this.position.y < -BORDE / 2) {
        this.velocity.y *= -1;
        this.position.y = -BORDE / 2
      }
      if (this.position.y > BORDE / 2) {
        this.velocity.y *= -1;
        this.position.y = BORDE / 2
      }
      if (this.position.z < -BORDE / 2) {
        this.velocity.z *= -1;
        this.position.z = -BORDE / 2;
      }
      if (this.position.z > BORDE / 2) {
        this.velocity.z *= -1;
        this.position.z = BORDE / 2
      }
    }
  }

  // Separación
  // Método que revisa los boids cercanos y vira para alejarse de ellos
  separate(boids) {
    let desiredseparation = SEPARATION;
    let steer = new THREE.Vector3(0, 0, 0);
    let count = 0;
    // Por cada boid en el sistema, revisa si está muy cerca
    for (let i = 0; i < boids.length; i++) {
      let d = this.position.distanceTo(boids[i].position);
      // Si la distancia es mayor a 0 y menor que una cantidad arbitraria (0 cuando eres tú mismo)
      if ((d > 0) && (d < desiredseparation)) {
        // Calcular el vector apuntando a alejarse del vecino
        let diff = this.position.clone();
        diff.sub(boids[i].position);
        diff.normalize();
        diff.divideScalar(d); // Peso por distancia
        steer.add(diff);
        count++; // Mantener registro de cantidad
      }
    }
    // Promedio -- divide por la cantidad
    if (count > 0) {
      steer.divideScalar(count);
    }

    // Mientras el vector sea mayor a 0
    if (mag(steer) > 0) {
      // Implementa Reynolds: Viraje = Deseado - Velocidad
      steer.normalize();
      steer.multiplyScalar(settings.vel_max);
      steer.sub(this.velocity);
      steer = limit(steer, settings.fuerza_max);
      //steer.clamp(steer, new THREE.Vector3(settings.fuerza_max,settings.fuerza_max,settings.fuerza_max));
    }
    return steer;
  }

  // Alineamiento
  // Para cada boid cercano en el sistema, calcula la velocidad promedio
  align(boids) {
    let neighbordist = ALINEAMIENTO_DISTANCE;
    let sum = new THREE.Vector3(0, 0, 0);
    let count = 0;
    for (let i = 0; i < boids.length; i++) {
      let d = this.position.distanceTo(boids[i].position);
      if ((d > 0) && (d < neighbordist)) {
        sum.add(boids[i].velocity);
        count++;
      }
    }
    if (count > 0) {
      sum.divideScalar(count);
      sum.normalize();
      sum.multiplyScalar(settings.vel_max);
      let steer = sum.clone();
      steer.sub(this.velocity);
      steer = limit(steer, settings.fuerza_max);
      return steer;
    } else {
      return new THREE.Vector3(0, 0, 0);
    }
  }

  // Cohesión
  // Para la ubicación promedio (centro) de todos los boids cercanos, calcula el vector de viraje hacia esa ubicación.
  cohesion(boids) {
    let neighbordist = COHESION_DISTANCE;
    let sum = new THREE.Vector3(0, 0, 0); // Empieza con un vector vacío para acumular todas las posiciones
    let count = 0;
    for (let i = 0; i < boids.length; i++) {
      let d = this.position.distanceTo(boids[i].position);
      if ((d > 0) && (d < neighbordist)) {
        sum.add(boids[i].position); // Añada posición
        count++;
      }
    }
    if (count > 0) {
      sum.divideScalar(count);
      return this.seek(sum); // Vira hacia la posición
    } else {
      return new THREE.Vector3(0, 0, 0);
    }
  }
}

//////////////////////////////////
//////////////////////////////////
///GUI
//////////////////////////////////
//////////////////////////////////

const panel = new GUI({
  width: 200
});
const folder1 = panel.addFolder('Audio');

folder1.add(settings, 'mute audio').onChange(muteAudio);
folder1.add(settings, 'volumen', 0.0, 1.0, 0.001).onChange(mainVolChange);

folder1.open();

const folder2 = panel.addFolder('Parametros de Parvada');

folder2.add(settings, "cant_agentes", 1, 50, 1).onChange((cant_actual) => {
  let cant_anterior = flock.boids.length;
  let cant_nueva = cant_actual - cant_anterior;
  if (cant_nueva < 0) { //eliminar agentes
    let cuantosQuitar = Math.abs(cant_nueva);
    for (let i = 0; i < cuantosQuitar; i++) {
      flock.removeBoid();
    }
  } else {
    for (let i = 0; i < cant_nueva; i++) {
      let b = new Boid(
        getRandomArbitrary(-BORDE / 2, BORDE / 2),
        getRandomArbitrary(-BORDE / 2, BORDE / 2),
        getRandomArbitrary(-BORDE / 2, BORDE / 2)
      );
      flock.addBoid(b);
    }
  }
});

folder2.add(settings, "alineamiento", 0.0, 2).onChange((a) => {
  ALINEAMIENTO_DISTANCE = BORDE * a;
});
folder2.add(settings, "cohesion", 0.0, 2).onChange((a) => {
  COHESION_DISTANCE = BORDE * a;
});
folder2.add(settings, "separacion", 0.0, 2).onChange((a) => {
  SEPARATION = BORDE * a;
});
const hipBorde = Math.sqrt(2 * 3);
folder2.add(settings, "syn_distancia", 0.0, hipBorde).onChange((a) => {
  SYNC_DISTANCIA = BORDE * a;
});
folder2.add(settings, 'bordes').onChange();

folder2.open();

const folder3 = panel.addFolder('Parametros de Luciernagas');
folder3.add(settings, "vol_min", 0.0, 1).onChange((a) => {
  //DESPIERTO = BORDE * a;
});

folder3.add(settings, "despierto", 0.0, 1).onChange((a) => {
  //DESPIERTO = BORDE * a;
});
folder3.add(settings, "vel_max", 0.0, 5).onChange((a) => {
  //MAX_SPEED = BORDE * a;
});
folder3.add(settings, "fuerza_max", 0.0, 5).onChange((a) => {
  //MAX_FORCE = BORDE * a;
});
folder3.open();

const folder4 = panel.addFolder('Audio descargas');
recController = folder4.add(settings, "inicia grabacion");
recController.disable();
let downloadController = folder4.add(settings, "descarga");
downloadController.disable()
let stats = new Stats();
document.body.appendChild(stats.dom);


//////////////////////////////////
//////////////////////////////////
///funcion graficos init
//////////////////////////////////
//////////////////////////////////
//principio de codigo
audioInit();

const clock = new THREE.Clock();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 20000);

camera.position.y = 0;
camera.position.z = BORDE;
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

let flock = new Flock();

for (let i = 0; i < settings.cant_agentes; i++) {
  let b = new Boid(
    getRandomArbitrary(-BORDE / 2, BORDE / 2),
    getRandomArbitrary(-BORDE / 2, BORDE / 2),
    getRandomArbitrary(-BORDE / 2, BORDE / 2)
  );
  flock.addBoid(b);
}

scene.background = new THREE.Color(0xA0A0A0);
const light = new THREE.AmbientLight(0xFFFFFF);
scene.add(light);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.99);
scene.add(directionalLight);

const geometry = new THREE.BoxGeometry(BORDE, BORDE, BORDE);
const material = new THREE.MeshPhongMaterial({
  color: 0xFF0000,
  opacity: 0.1,
  transparent: true
});

const border = new THREE.Mesh(geometry, material);
scene.add(border);

animate();

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time) {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  frameRate = clock.getDelta();
  flock.run();
  stats.update();
}

//////////////////////////////////
//////////////////////////////////
///funcion de control
//////////////////////////////////
//////////////////////////////////
document.onkeydown = function(e) {
  switch (e.keyCode) {
    case 65:
      console.log("nuevo plano");
      proyecciones.addPlano(new Plano());
      //vistasPlanos.addVista(new VistaPlano());
      break;
    case 66:
      break;
  };
}

//////////////////////////////////
//////////////////////////////////
///funcion secundariass
//////////////////////////////////
//////////////////////////////////
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function mag(v) {
  return Math.sqrt(magSq(v));
}

function magSq(v) {
  return (v.x * v.x) + (v.y * v.y) + (v.z * v.z);
}

function limit(v, max) {
  const mSq = magSq(v);
  if (mSq > max * max) {
    v.divideScalar(Math.sqrt(mSq));
    v.multiplyScalar(max);
  }
  return v;
};

function map(n, start1, stop1, start2, stop2, withinBounds) {
  const newval = (n - start1) / (stop1 - start1) * (stop2 - start2) + start2;
  if (!withinBounds) {
    return newval;
  }
  if (start2 < stop2) {
    return constrain(newval, start2, stop2);
  } else {
    return constrain(newval, stop2, start2);
  }
};

function constrain(n, low, high) {
  return Math.max(Math.min(n, high), low);
};