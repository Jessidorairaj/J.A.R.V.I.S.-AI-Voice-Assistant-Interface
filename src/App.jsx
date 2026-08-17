import { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Square, 
  Disc, 
  Download,
  AudioLines,
  Captions,
  ChevronRight,
  Clock3,
  CalendarDays,
  MapPin,
  Bell,
  Mail,
  History,
  FileText,
  Bot,
  Settings,
  SlidersHorizontal,
  Activity,
  Cloud,
  HelpCircle,
  Power
} from 'lucide-react';
import './App.css';
import LiquidVisualizer from './components/LiquidVisualizer';
import { AudioAnalyzerManager } from './utils/audioAnalyzer';

function App() {
  // Audio state
  const [pitch, setPitch] = useState(-1);
  const [volume, setVolume] = useState(0);
  const [note, setNote] = useState('');
  
  // Status state
  const [isMicOn, setIsMicOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [selectedMimeType, setSelectedMimeType] = useState('');
  const [audioInputs, setAudioInputs] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechSupported] = useState(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [now, setNow] = useState(new Date());
  const [audioData, setAudioData] = useState({ waveform: [], spectrum: [], peakFrequency: 0 });
  const [aiMode, setAiMode] = useState('Assistant');
  const [aiState, setAiState] = useState('Idle');
  const [confidence, setConfidence] = useState(0);
  const [latency, setLatency] = useState(18);
  const [cpuLoad, setCpuLoad] = useState(12);
  const [memoryLoad, setMemoryLoad] = useState(62);
  const [networkStatus, setNetworkStatus] = useState('Connected');
  const [activeControl, setActiveControl] = useState('Microphone Toggle');
  const [timeline, setTimeline] = useState([
    { label: 'System ready', status: 'completed' },
    { label: 'Awaiting voice', status: 'active' }
  ]);
  const [historyItems, setHistoryItems] = useState([]);
  const [contextFile, setContextFile] = useState('');
  
  // Audio context and recorder refs
  const analyzerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const animationFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize AudioAnalyzer on mount
  useEffect(() => {
    analyzerRef.current = new AudioAnalyzerManager();

    const loadAudioInputs = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((device) => device.kind === 'audioinput');
        setAudioInputs(inputs);
        setSelectedDeviceId((currentDeviceId) => currentDeviceId || inputs[0]?.deviceId || '');
      } catch (err) {
        console.warn('Unable to list microphones:', err);
      }
    };

    loadAudioInputs();

    navigator.mediaDevices?.addEventListener?.('devicechange', loadAudioInputs);

    // Clean up resources on unmount
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadAudioInputs);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (analyzerRef.current) {
        analyzerRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const metricsTimer = setInterval(() => {
      const voiceEnergy = Math.min(volume * 850, 1);
      setCpuLoad(Math.round(10 + voiceEnergy * 38 + Math.sin(Date.now() / 1400) * 4));
      setMemoryLoad(Math.round(56 + voiceEnergy * 14 + Math.cos(Date.now() / 1800) * 3));
      setLatency(Math.round(16 + voiceEnergy * 42));
      setConfidence(isMicOn ? Math.round(74 + voiceEnergy * 24) : 0);
    }, 360);

    return () => clearInterval(metricsTimer);
  }, [isMicOn, volume]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        setTranscript((current) => `${current} ${finalText}`.trim());
        setHistoryItems((current) => [
          { type: 'voice', text: finalText.trim(), time: new Date().toLocaleTimeString('en-US', { hour12: false }) },
          ...current
        ].slice(0, 5));
        setTimeline([
          { label: 'Voice detected', status: 'completed' },
          { label: 'Processing', status: 'completed' },
          { label: 'Reasoning', status: 'active' },
          { label: 'Generating response', status: 'pending' }
        ]);
        setAiState('Thinking');
        window.setTimeout(() => {
          setAiState('Responding');
          setTimeline([
            { label: 'Voice detected', status: 'completed' },
            { label: 'Processing', status: 'completed' },
            { label: 'Reasoning', status: 'completed' },
            { label: 'Generating response', status: 'active' }
          ]);
        }, 650);
        window.setTimeout(() => {
          setAiState(analyzerRef.current?.micStream ? 'Listening' : 'Idle');
          setTimeline([
            { label: 'Voice detected', status: 'completed' },
            { label: 'Processing', status: 'completed' },
            { label: 'Response ready', status: 'completed' },
            { label: 'Listening', status: analyzerRef.current?.micStream ? 'active' : 'pending' }
          ]);
        }, 1700);
      }
      setInterimTranscript(interimText.trim());
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      if (analyzerRef.current?.micStream) {
        try {
          recognition.start();
        } catch (err) {
          console.warn('Speech recognition restart skipped:', err);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const refreshAudioInputs = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === 'audioinput');
    setAudioInputs(inputs);
    setSelectedDeviceId((currentDeviceId) => currentDeviceId || inputs[0]?.deviceId || '');
  };

  // Poll analysis data from the analyser node
  const startPolling = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const poll = () => {
      if (analyzerRef.current) {
        const data = analyzerRef.current.getAnalysisData();
        setPitch(data.pitch);
        setVolume(data.volume);
        setNote(data.note);
        setAudioData({
          waveform: data.waveform,
          spectrum: data.spectrum,
          peakFrequency: data.peakFrequency
        });
      }
      animationFrameRef.current = requestAnimationFrame(poll);
    };

    poll();
  };

  const stopPolling = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setPitch(-1);
    setVolume(0);
    setNote('');
    setAudioData({ waveform: [], spectrum: [], peakFrequency: 0 });
  };

  // Turn microphone on or off
  const toggleMic = async () => {
    try {
      if (isMicOn) {
        if (isRecording) {
          stopRecording();
        }
        analyzerRef.current.stopMic();
        recognitionRef.current?.stop();
        setIsMicOn(false);
        setAiState('Idle');
        setTimeline([
          { label: 'Microphone stopped', status: 'completed' },
          { label: 'Awaiting voice', status: 'active' }
        ]);
        stopPolling();
      } else {
        await analyzerRef.current.startMic(selectedDeviceId);
        setIsMicOn(true);
        setAiState('Listening');
        setTimeline([
          { label: 'Microphone enabled', status: 'completed' },
          { label: 'Voice detected', status: 'pending' },
          { label: 'Processing', status: 'pending' },
          { label: 'Completed', status: 'pending' }
        ]);
        await refreshAudioInputs();
        if (recognitionRef.current) {
          setInterimTranscript('');
          recognitionRef.current.start();
        }
        startPolling();
      }
    } catch (err) {
      console.error("Microphone activation failed:", err);
      alert("Microphone connection failed. Please enable mic permissions in your browser.");
    }
  };

  // Start MediaRecorder audio capture
  const startRecording = () => {
    if (!isMicOn) return;
    setRecordingBlob(null);
    audioChunksRef.current = [];

    try {
      const stream = analyzerRef.current.micStream;

      // Identify supported browser container codecs
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4;codecs=mp4a',
        'audio/mp4',
        'audio/aac'
      ];
      
      let bestMimeType = '';
      let options = {};
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          bestMimeType = mime;
          options = { mimeType: mime };
          break;
        }
      }

      setSelectedMimeType(bestMimeType);
      console.log("Recorder initialized with codec:", bestMimeType);

      mediaRecorderRef.current = new MediaRecorder(stream, options);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const mime = bestMimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setRecordingBlob(blob);
        setIsRecording(false);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start MediaRecorder:", err);
    }
  };

  // Stop MediaRecorder capture
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Download the recorded audio file directly to the user's system
  const downloadRecording = () => {
    if (!recordingBlob) return;

    // Detect correct file extension based on selected MIME type
    let ext = 'webm';
    if (selectedMimeType.includes('mp4')) {
      ext = 'mp4';
    } else if (selectedMimeType.includes('ogg')) {
      ext = 'ogg';
    } else if (selectedMimeType.includes('aac')) {
      ext = 'aac';
    }

    const url = URL.createObjectURL(recordingBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stimulation-${Date.now()}.${ext}`;
    
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleControlAction = (label) => {
    setActiveControl(label);

    if (label === 'Microphone Toggle') {
      toggleMic();
      return;
    }

    if (label === 'AI Mode Selector') {
      setAiMode((current) => {
        const modes = ['Assistant', 'Command', 'Dictation'];
        return modes[(modes.indexOf(current) + 1) % modes.length];
      });
      setAiState('Thinking');
      setTimeline([
        { label: 'Mode command received', status: 'completed' },
        { label: 'Applying profile', status: 'active' },
        { label: 'Completed', status: 'pending' }
      ]);
      window.setTimeout(() => {
        setAiState(isMicOn ? 'Listening' : 'Idle');
        setTimeline([
          { label: 'Mode command received', status: 'completed' },
          { label: 'Profile active', status: 'completed' },
          { label: isMicOn ? 'Listening' : 'Idle', status: 'active' }
        ]);
      }, 900);
      return;
    }

    if (label === 'Conversation History') {
      setTimeline([
        { label: 'History opened', status: 'completed' },
        { label: `${historyItems.length} voice entries loaded`, status: 'active' }
      ]);
      return;
    }

    if (label === 'File Context') {
      fileInputRef.current?.click();
      setTimeline([
        { label: 'File context requested', status: 'active' },
        { label: 'Awaiting file', status: 'pending' }
      ]);
      return;
    }

    if (label === 'Automations') {
      setAiState('Thinking');
      setTimeline([
        { label: 'Automation scan', status: 'completed' },
        { label: 'No scheduled tasks', status: 'active' }
      ]);
      window.setTimeout(() => setAiState(isMicOn ? 'Listening' : 'Idle'), 700);
      return;
    }

    if (label === 'Settings') {
      setNetworkStatus((current) => current === 'Connected' ? 'Optimized' : 'Connected');
      setTimeline([
        { label: 'Settings toggled', status: 'completed' },
        { label: 'Network profile updated', status: 'active' }
      ]);
    }
  };

  const handleContextFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setContextFile(file.name);
    setTimeline([
      { label: 'File context loaded', status: 'completed' },
      { label: file.name, status: 'active' }
    ]);
  };

  const activeSegments = Math.max(5, Math.round(42 * (isMicOn ? 0.78 + Math.min(volume * 5, 0.22) : 0.28)));
  const inputSegments = Math.max(3, Math.round(34 * Math.min(volume * 9, isMicOn ? 0.92 : 0.18)));
  const timeText = now.toLocaleTimeString('en-US', { hour12: false });
  const dateText = now.toLocaleDateString('en-GB').replace(/\//g, '-');
  const shownTranscript = transcript || interimTranscript;
  const controlItems = [
    ['Microphone Toggle', isMicOn ? MicOff : Mic],
    ['AI Mode Selector', SlidersHorizontal],
    ['Conversation History', History],
    ['File Context', FileText],
    ['Automations', Bot],
    ['Settings', Settings],
  ];

  return (
    <div className="fullscreen-app">
      <div 
        className="ambient-bg-glow"
        style={{
          transform: `scale(${1 + volume * 2.2})`,
          opacity: 0.48 + volume * 2.2
        }}
      />
      <div className="hud-lines" aria-hidden="true">
        <span className="hud-line top-left" />
        <span className="hud-line top-right" />
        <span className="hud-line bottom-left" />
        <span className="hud-line bottom-right" />
      </div>

      <header className="minimal-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <AudioLines size={20} />
          </span>
          <span>
            <span className="spaced-title">J.A.R.V.I.S.</span>
            <span className="sub-title">Just a rather very intelligent system</span>
          </span>
        </div>
        <div className="hud-readout">
          <span className={`hud-dot ${isMicOn ? 'active' : ''}`} />
          <span>{isMicOn ? 'LIVE' : 'STANDBY'}</span>
          <span className="hud-divider">|</span>
          <span>{pitch > 0 ? `${Math.round(pitch)} Hz` : '-- Hz'}</span>
          <span className="hud-divider">|</span>
          <span>{note || '--'}</span>
        </div>
      </header>

      <main className="orb-viewport">
        <LiquidVisualizer 
          pitch={pitch} 
          volume={volume} 
          isActive={isMicOn}
          aiState={aiState}
          waveform={audioData.waveform}
          spectrum={audioData.spectrum}
        />
      </main>

      <section className="hud-panel status-panel" aria-label="System status">
        <div className="panel-title">
          <span>System status</span>
          <span>{isMicOn ? '100%' : '42%'}</span>
        </div>
        <div className="status-meter">
          <div className="status-meter-top">
            <span>{isMicOn ? 'Online' : 'Standby'}</span>
            <span className={`status-dot ${isMicOn ? 'active' : ''}`} />
          </div>
          <div className="segmented-meter">
            {Array.from({ length: 42 }, (_, index) => (
              <span key={index} className={index < activeSegments ? 'active' : ''} />
            ))}
          </div>
        </div>
        <input ref={fileInputRef} type="file" className="sr-only" onChange={handleContextFile} />
        <div className="diagnostics control-stack">
          {controlItems.map(([label, Icon]) => (
            <button
              className={`panel-row control-row ${activeControl === label ? 'active' : ''}`}
              key={label}
              type="button"
              onClick={() => handleControlAction(label)}
            >
              <span className="diagnostic-icon"><Icon size={16} /></span>
              <span>{label}</span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
        <label className="mic-picker">
          <span className="panel-title">Laptop microphone</span>
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            disabled={isMicOn || audioInputs.length === 0}
            title={isMicOn ? 'Turn mic off before changing input' : 'Choose microphone input'}
          >
            {audioInputs.length === 0 ? (
              <option value="">Default microphone</option>
            ) : (
              audioInputs.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))
            )}
          </select>
        </label>
      </section>

      <section className="hud-panel objectives-panel" aria-label="Current objectives">
        <div className="panel-title">Current objectives</div>
        <div className="objective-list">
          <span className="objective">Mode: {aiMode}</span>
          <span className="objective">State: {aiState}</span>
          <span className="objective">Context: {contextFile || 'No file'}</span>
          <span className="objective">History: {historyItems.length} entries</span>
        </div>
        <div className="panel-title" style={{ marginTop: 18 }}>Notifications</div>
        <div className="panel-row">
          <Mail size={16} />
          <span>0 new messages</span>
        </div>
        <div className="panel-row">
          <Bell size={16} />
          <span>0 alerts</span>
        </div>
      </section>

      <section className="hud-panel voice-panel" aria-label="Voice recognition">
        <div className="panel-title">Voice status</div>
        <div className="mini-bars" aria-hidden="true">
          {Array.from({ length: 45 }, (_, index) => (
            <span
              key={index}
              style={{
                '--i': `${index}`,
                '--bar': `${9 + Math.abs(Math.sin(index * 0.57)) * 38 + (isMicOn ? volume * 220 : 0)}`
              }}
            />
          ))}
        </div>
        <div className="panel-row">
          <span className={`status-dot ${isMicOn ? 'active' : ''}`} />
          <span>{aiState}</span>
        </div>
      </section>

      <section className="input-panel" aria-label="Input level">
        <div className="panel-title">Input level</div>
        <div className="input-level">
          {Array.from({ length: 34 }, (_, index) => (
            <span key={index} className={index < inputSegments ? 'active' : ''} />
          ))}
        </div>
      </section>

      <section className="hud-panel info-panel" aria-label="System information">
        <div className="info-item">
          <Clock3 size={26} />
          <span>
            <span className="info-label">Time</span>
            <span className="info-value">{timeText}</span>
          </span>
        </div>
        <div className="info-item">
          <CalendarDays size={26} />
          <span>
            <span className="info-label">Date</span>
            <span className="info-value">{dateText}</span>
          </span>
        </div>
        <div className="info-item">
          <MapPin size={26} />
          <span>
            <span className="info-label">Location</span>
            <span className="info-value">{networkStatus}<br />Laptop input</span>
          </span>
        </div>
      </section>

      <section className="hud-panel temp-panel" aria-label="Voice metrics">
        <div className="info-item">
          <Activity size={27} />
          <span>
            <span className="info-label">Live metrics</span>
            <span className="info-value">
              Vol {Math.round(Math.min(volume * 900, 100))}% / Peak {audioData.peakFrequency || 0} Hz<br />
              Conf {confidence}% / Lat {latency}ms<br />
              CPU {cpuLoad}% / Mem {memoryLoad}%
            </span>
          </span>
        </div>
      </section>

      <section className="transcript-panel" aria-label="Speech transcript">
        <div className="transcript-title">
          <Captions size={16} />
          <span>{isMicOn ? 'Listening...' : 'Voice interface idle'}</span>
        </div>
        <p ref={transcriptRef} className={`transcript-copy ${!shownTranscript ? 'empty' : ''}`}>
          {speechSupported
            ? shownTranscript
              ? shownTranscript
              : isMicOn ? 'ACTIVE' : 'ACTIVATE'
            : 'Speech-to-text is not supported in this browser'}
        </p>
      </section>

      <section className="timeline-panel" aria-label="Activity timeline">
        {timeline.map((item, index) => (
          <div className={`timeline-step ${item.status}`} key={`${item.label}-${index}`}>
            <span className="timeline-dot" />
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <footer className="controls-floating-bar">
        <button 
          id="btn-mic-toggle"
          className={`control-circle-btn ${isMicOn ? 'active' : ''}`}
          onClick={toggleMic}
          title={isMicOn ? 'Mute Microphone' : 'Enable Microphone'}
        >
          {isMicOn ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button 
          id="btn-record-toggle"
          className={`control-circle-btn btn-record-accent ${isRecording ? 'recording' : ''} ${!isMicOn ? 'disabled' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isMicOn}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
          style={
            isRecording 
              ? {
                  transform: `scale(${1 + volume * 0.3})`,
                  boxShadow: `0 0 ${15 + volume * 45}px rgba(0, 229, 255, ${0.5 + volume * 0.5})`
                }
              : {}
          }
        >
          {isRecording ? <Square size={16} /> : <Disc size={20} />}
        </button>

        <button 
          id="btn-download-action"
          className={`control-circle-btn btn-download-accent ${!recordingBlob ? 'disabled' : ''}`}
          onClick={downloadRecording}
          disabled={!recordingBlob}
          title="Download Stimulation Audio"
        >
          <Download size={20} />
        </button>
        <button
          className="control-circle-btn"
          type="button"
          title="System logs"
          onClick={() => handleControlAction('Conversation History')}
        >
          <FileText size={20} />
        </button>
        <button
          className="control-circle-btn"
          type="button"
          title="Updates"
          onClick={() => handleControlAction('Automations')}
        >
          <Cloud size={20} />
        </button>
        <button
          className="control-circle-btn"
          type="button"
          title="Help"
          onClick={() => handleControlAction('AI Mode Selector')}
        >
          <HelpCircle size={20} />
        </button>
        <button
          className="control-circle-btn"
          type="button"
          title="Exit voice session"
          onClick={() => isMicOn && toggleMic()}
        >
          <Power size={20} />
        </button>
      </footer>
    </div>
  );
}

export default App;
