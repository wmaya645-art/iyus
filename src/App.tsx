/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Bell, 
  BellOff, 
  Plus, 
  Trash2, 
  Play, 
  Settings as SettingsIcon, 
  Calendar,
  User,
  BookOpen,
  Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parse, isBefore, isAfter, addMinutes } from 'date-fns';
import { ScheduleItem, AppSettings } from './types';
import { generateAnnouncementAudio, playAudioFromBase64 } from './services/geminiService';
import { supabase } from './services/supabaseClient';

const DEFAULT_SCHEDULE: ScheduleItem[] = [
  { id: '1', period: 1, startTime: '07:00', endTime: '07:45', teacher: 'Budi Santoso', gender: 'Bapak', subject: 'Matematika', className: 'X-A', isActive: true },
  { id: '2', period: 2, startTime: '07:45', endTime: '08:30', teacher: 'Siti Aminah', gender: 'Ibu', subject: 'Bahasa Indonesia', className: 'XI-B', isActive: true },
  { id: '3', period: 3, startTime: '08:30', endTime: '09:15', teacher: 'Siti Aminah', gender: 'Ibu', subject: 'Bahasa Indonesia', className: 'XI-B', isActive: true },
  { id: '4', period: 4, startTime: '09:30', endTime: '10:15', teacher: 'Joko Widodo', gender: 'Bapak', subject: 'Fisika', className: 'XII-C', isActive: true },
  { id: '5', period: 5, startTime: '10:15', endTime: '11:00', teacher: 'Joko Widodo', gender: 'Bapak', subject: 'Fisika', className: 'XII-C', isActive: true },
];

const CHIME_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    schoolName: 'SMP ISLAM ARRAUDHOH',
    isAutoEnabled: true,
    voiceName: 'Kore'
  });
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      if (supabase) {
        try {
          // Fetch Schedule
          const { data: scheduleData, error: scheduleError } = await supabase
            .from('schedules')
            .select('*')
            .order('startTime', { ascending: true });
          
          if (scheduleError) throw scheduleError;
          if (scheduleData && scheduleData.length > 0) {
            setSchedule(scheduleData);
          } else {
            setSchedule(DEFAULT_SCHEDULE);
          }

          // Fetch Settings
          const { data: settingsData, error: settingsError } = await supabase
            .from('settings')
            .select('*')
            .single();
          
          if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;
          if (settingsData) {
            const { id, ...rest } = settingsData;
            setSettings(rest);
          }
        } catch (error) {
          console.error('Error fetching from Supabase:', error);
          // Fallback to localStorage
          const savedSchedule = localStorage.getItem('school_bell_schedule');
          const savedSettings = localStorage.getItem('school_bell_settings');
          if (savedSchedule) setSchedule(JSON.parse(savedSchedule));
          if (savedSettings) setSettings(JSON.parse(savedSettings));
        }
      } else {
        // Fallback to localStorage
        const savedSchedule = localStorage.getItem('school_bell_schedule');
        const savedSettings = localStorage.getItem('school_bell_settings');
        setSchedule(savedSchedule ? JSON.parse(savedSchedule) : DEFAULT_SCHEDULE);
        setSettings(savedSettings ? JSON.parse(savedSettings) : {
          schoolName: 'SMP ISLAM ARRAUDHOH',
          isAutoEnabled: true,
          voiceName: 'Kore'
        });
      }
      setIsLoading(false);
    };

    fetchData();
  }, []);

  // Persistence (Backup to localStorage)
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('school_bell_schedule', JSON.stringify(schedule));
    }
  }, [schedule, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('school_bell_settings', JSON.stringify(settings));
    }
  }, [settings, isLoading]);

  // Sync Settings to Supabase
  const updateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (supabase) {
      try {
        const { error } = await supabase
          .from('settings')
          .upsert({ id: 1, ...newSettings });
        if (error) throw error;
      } catch (error) {
        console.error('Error updating settings in Supabase:', error);
      }
    }
  };

  // Clock and Trigger Logic
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      if (settings.isAutoEnabled) {
        const timeStr = format(now, 'HH:mm');
        
        // Check if we already triggered this minute
        if (lastTriggered !== timeStr) {
          const matchingItem = schedule.find(item => item.isActive && item.startTime === timeStr);
          if (matchingItem) {
            triggerBell(matchingItem);
            setLastTriggered(timeStr);
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [schedule, settings.isAutoEnabled, lastTriggered]);

  const triggerBell = async (item: ScheduleItem) => {
    if (isAnnouncing) return;
    setIsAnnouncing(true);

    try {
      // 1. Play Chime Music First
      const chime = new Audio(CHIME_URL);
      await new Promise((resolve) => {
        chime.onended = resolve;
        chime.onerror = resolve; // Continue even if chime fails
        chime.play().catch(resolve);
      });

      // 2. Prepare Announcement Text
      const greeting = "Assalamualaikum warahmatullohi wabarokatuh, kepada siswa SMP ISLAM ARRAUDHOH. ";
      const text = `${greeting} Perhatian. Jam ke ${item.period}. Pukul ${item.startTime}. ${item.gender} Guru ${item.teacher}, pengampu mata pelajaran ${item.subject}, dipersilakan masuk kelas ${item.className}. Selamat belajar.`;
      
      // 3. Generate and Play Announcement
      const audioData = await generateAnnouncementAudio(text, settings.voiceName);
      if (audioData) {
        try {
          await playAudioFromBase64(audioData);
        } catch (playError) {
          console.warn("Gemini audio playback failed, falling back to browser TTS:", playError);
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'id-ID';
          window.speechSynthesis.speak(utterance);
        }
      } else {
        console.warn("No audio data from Gemini, falling back to browser TTS");
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error("Failed to trigger bell:", error);
    } finally {
      setIsAnnouncing(false);
    }
  };

  const handleAddSchedule = async (newItem: Omit<ScheduleItem, 'id' | 'isActive'>) => {
    const item: ScheduleItem = {
      ...newItem,
      id: Math.random().toString(36).substr(2, 9),
      isActive: true
    };
    
    const newSchedule = [...schedule, item].sort((a, b) => a.startTime.localeCompare(b.startTime));
    setSchedule(newSchedule);
    setShowAddModal(false);

    if (supabase) {
      try {
        const { error } = await supabase.from('schedules').insert(item);
        if (error) throw error;
      } catch (error) {
        console.error('Error adding schedule to Supabase:', error);
      }
    }
  };

  const handleEditSchedule = async (updatedItem: ScheduleItem) => {
    const newSchedule = schedule.map(item => item.id === updatedItem.id ? updatedItem : item).sort((a, b) => a.startTime.localeCompare(b.startTime));
    setSchedule(newSchedule);
    setEditingItem(null);

    if (supabase) {
      try {
        const { error } = await supabase
          .from('schedules')
          .update(updatedItem)
          .eq('id', updatedItem.id);
        if (error) throw error;
      } catch (error) {
        console.error('Error updating schedule in Supabase:', error);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const newSchedule = schedule.filter(item => item.id !== id);
    setSchedule(newSchedule);

    if (supabase) {
      try {
        const { error } = await supabase
          .from('schedules')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } catch (error) {
        console.error('Error deleting schedule from Supabase:', error);
      }
    }
  };

  const toggleActive = async (id: string) => {
    const itemToToggle = schedule.find(item => item.id === id);
    if (!itemToToggle) return;

    const updatedItem = { ...itemToToggle, isActive: !itemToToggle.isActive };
    const newSchedule = schedule.map(item => item.id === id ? updatedItem : item);
    setSchedule(newSchedule);

    if (supabase) {
      try {
        const { error } = await supabase
          .from('schedules')
          .update({ isActive: updatedItem.isActive })
          .eq('id', id);
        if (error) throw error;
      } catch (error) {
        console.error('Error toggling active state in Supabase:', error);
      }
    }
  };

  const nextBell = schedule
    .filter(i => i.isActive && i.startTime > format(currentTime, 'HH:mm'))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

  return (
    <div className="min-h-screen bg-indigo-50 text-slate-900 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header / Top Bar */}
      <header className="bg-indigo-600 text-white shadow-lg p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-xl shadow-inner">
            <Bell className="text-indigo-600" size={32} />
          </div>
          <div>
            <h1 className="font-serif italic text-3xl tracking-tight leading-none">{settings.schoolName}</h1>
            <p className="text-xs uppercase tracking-widest opacity-80 font-mono mt-1">Sistem Bel Otomatis v2.2</p>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="hidden sm:block text-[10px] uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full border border-white/20">
            <span className="opacity-70">Audio Status:</span> <span className="text-emerald-300 font-bold">Ready</span>
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl tracking-tighter flex items-center gap-2 drop-shadow-md">
              <Clock size={28} />
              {format(currentTime, 'HH:mm:ss')}
            </div>
            <div className="text-[10px] uppercase tracking-widest opacity-80 font-mono">
              {format(currentTime, 'EEEE, dd MMMM yyyy')}
            </div>
          </div>
          
          <button 
            onClick={() => updateSettings({ ...settings, isAutoEnabled: !settings.isAutoEnabled })}
            className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-lg transition-all transform active:scale-95 ${settings.isAutoEnabled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-rose-500 text-white hover:bg-rose-600'}`}
          >
            {settings.isAutoEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            <span className="text-sm font-bold uppercase tracking-wider">
              {settings.isAutoEnabled ? 'Auto ON' : 'Auto OFF'}
            </span>
          </button>
        </div>
      </header>

      {/* Running Text / Marquee */}
      <div className="bg-amber-400 text-indigo-900 py-2 overflow-hidden border-b border-indigo-900/20 shadow-inner">
        <div className="whitespace-nowrap animate-marquee font-bold uppercase tracking-[0.2em] text-sm">
          Selamat Datang di SMP ISLAM ARRAUDHOH Kec. Klapanunggal Kab. Bogor — Selamat Datang di SMP ISLAM ARRAUDHOH Kec. Klapanunggal Kab. Bogor — Selamat Datang di SMP ISLAM ARRAUDHOH Kec. Klapanunggal Kab. Bogor
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Schedule Table */}
        <section className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-end border-b-2 border-indigo-100 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="text-indigo-500" />
              <h2 className="font-serif italic text-2xl text-indigo-900">Jadwal Pelajaran</h2>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition-all transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              <span className="text-xs font-bold uppercase">Tambah</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-indigo-50">
            {/* Table Header */}
            <div className="grid grid-cols-[60px_1fr_1fr_1.5fr_1.5fr_120px] p-5 bg-indigo-50/50 text-[11px] uppercase tracking-widest font-bold text-indigo-400">
              <div>Jam</div>
              <div>Waktu</div>
              <div>Kelas</div>
              <div>Guru Pengampu</div>
              <div>Mata Pelajaran</div>
              <div className="text-right">Aksi</div>
            </div>

            <div className="divide-y divide-indigo-50">
              {schedule.length === 0 ? (
                <div className="p-16 text-center text-slate-400 italic font-serif text-lg">Belum ada jadwal yang ditambahkan.</div>
              ) : (
                schedule.map((item) => (
                  <motion.div 
                    layout
                    key={item.id}
                    className={`grid grid-cols-[60px_1fr_1fr_1.5fr_1.5fr_120px] p-5 items-center transition-all group ${!item.isActive ? 'opacity-40 grayscale bg-slate-50' : 'hover:bg-indigo-50/30'}`}
                  >
                    <div className="font-mono text-xl font-bold text-indigo-600">{item.period}</div>
                    <div className="font-mono text-sm bg-indigo-50 text-indigo-700 px-2 py-1 rounded w-fit">{item.startTime} - {item.endTime}</div>
                    <div className="font-bold text-indigo-500">{item.className}</div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-indigo-400 leading-none mb-1">{item.gender}</span>
                      <span className="font-bold text-slate-700">{item.teacher}</span>
                    </div>
                    <div className="italic font-serif text-lg text-slate-600">{item.subject}</div>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => triggerBell(item)}
                        className="p-2 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all"
                        title="Test Bell"
                      >
                        <Play size={14} fill="currentColor" />
                      </button>
                      <button 
                        onClick={() => setEditingItem(item)}
                        className="p-2 rounded-full bg-amber-100 text-amber-600 hover:bg-amber-500 hover:text-white transition-all"
                        title="Edit"
                      >
                        <SettingsIcon size={14} />
                      </button>
                      <button 
                        onClick={() => toggleActive(item.id)}
                        className={`p-2 rounded-full transition-all ${item.isActive ? 'bg-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-500 hover:text-white'}`}
                        title={item.isActive ? "Deactivate" : "Activate"}
                      >
                        {item.isActive ? <Bell size={14} /> : <BellOff size={14} />}
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-500 hover:text-white transition-all"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Sidebar / Settings */}
        <aside className="space-y-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 space-y-6 border border-indigo-50">
            <div className="flex items-center gap-2 border-b-2 border-indigo-50 pb-3">
              <SettingsIcon className="text-indigo-500" size={20} />
              <h2 className="font-serif italic text-xl text-indigo-900">Pengaturan</h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Nama Sekolah</label>
                <input 
                  type="text" 
                  value={settings.schoolName}
                  onChange={(e) => updateSettings({ ...settings, schoolName: e.target.value })}
                  className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Suara Pengumuman</label>
                <div className="relative">
                  <select 
                    value={settings.voiceName}
                    onChange={(e) => updateSettings({ ...settings, voiceName: e.target.value as any })}
                    className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer transition-all"
                  >
                    <option value="Kore">Kore (Standard)</option>
                    <option value="Puck">Puck (Deep)</option>
                    <option value="Charon">Charon (Calm)</option>
                    <option value="Fenrir">Fenrir (Bold)</option>
                    <option value="Zephyr">Zephyr (Light)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                    <Volume2 size={16} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-xl p-6 text-white space-y-5 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 opacity-10 rotate-12">
              <Bell size={120} />
            </div>
            
            <div className="flex items-center gap-2 border-b border-white/20 pb-3 relative z-10">
              <Volume2 size={20} />
              <h2 className="font-serif italic text-xl">Status Sistem</h2>
            </div>
            
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">Status:</span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${settings.isAutoEnabled ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300'}`}>
                  {settings.isAutoEnabled ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div className="flex flex-col gap-1 bg-white/10 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-70">Bel Berikutnya:</span>
                  <span className="font-mono font-bold text-indigo-200">
                    {nextBell?.startTime || '--:--'}
                  </span>
                </div>
                {nextBell && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="text-[10px] uppercase font-bold text-indigo-300">Jam Ke {nextBell.period} - Kelas {nextBell.className}</div>
                    <div className="text-sm font-serif italic">{nextBell.subject}</div>
                    <div className="text-[10px] opacity-70">{nextBell.teacher}</div>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center bg-white/10 rounded-lg p-3">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">Pemicu Terakhir:</span>
                <span className="font-mono font-bold text-indigo-200">{lastTriggered || 'None'}</span>
              </div>
            </div>

            {isAnnouncing && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-2 flex items-center gap-3 text-emerald-300 bg-emerald-400/10 p-3 rounded-xl border border-emerald-400/20"
              >
                <div className="flex items-end gap-1 h-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <motion.div 
                      key={i}
                      animate={{ height: [4, 16, 4] }}
                      transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                      className="w-1 bg-emerald-400 rounded-full"
                    />
                  ))}
                </div>
                <span className="text-[10px] uppercase tracking-widest font-black">Broadcasting...</span>
              </motion.div>
            )}
          </div>
        </aside>
      </main>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(showAddModal || editingItem) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-indigo-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md space-y-6 border border-indigo-50"
            >
              <div className="flex justify-between items-center border-b-2 border-indigo-50 pb-4">
                <h3 className="font-serif italic text-3xl text-indigo-900">
                  {editingItem ? 'Edit Jadwal' : 'Tambah Jadwal'}
                </h3>
                <button onClick={() => { setShowAddModal(false); setEditingItem(null); }} className="text-slate-400 hover:text-rose-500 transition-colors">
                  <Trash2 size={24} />
                </button>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = {
                  period: parseInt(formData.get('period') as string),
                  startTime: formData.get('startTime') as string,
                  endTime: formData.get('endTime') as string,
                  teacher: formData.get('teacher') as string,
                  gender: formData.get('gender') as 'Bapak' | 'Ibu',
                  subject: formData.get('subject') as string,
                  className: formData.get('className') as string,
                };

                if (editingItem) {
                  handleEditSchedule({ ...editingItem, ...data });
                } else {
                  handleAddSchedule(data);
                }
              }} className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Jam Ke</label>
                    <input name="period" type="number" defaultValue={editingItem?.period} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Kelas</label>
                    <input name="className" type="text" defaultValue={editingItem?.className} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500" placeholder="Contoh: X-A" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Mata Pelajaran</label>
                    <input name="subject" type="text" defaultValue={editingItem?.subject} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Waktu Mulai</label>
                    <input name="startTime" type="time" defaultValue={editingItem?.startTime} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Waktu Selesai</label>
                    <input name="endTime" type="time" defaultValue={editingItem?.endTime} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Bapak/Ibu</label>
                    <select name="gender" defaultValue={editingItem?.gender} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer">
                      <option value="Bapak">Bapak</option>
                      <option value="Ibu">Ibu</option>
                    </select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-400">Nama Guru</label>
                    <input name="teacher" type="text" defaultValue={editingItem?.teacher} required className="w-full bg-indigo-50/50 border-2 border-indigo-100 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform active:scale-95"
                  >
                    {editingItem ? 'Simpan Perubahan' : 'Simpan Jadwal'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setShowAddModal(false); setEditingItem(null); }}
                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="p-12 text-center">
        <div className="flex justify-center items-center gap-4 opacity-30 mb-2">
          <div className="h-px w-12 bg-indigo-900"></div>
          <p className="text-[10px] uppercase tracking-[0.4em] font-bold text-indigo-900">
            SMP ISLAM ARRAUDHOH Smart Bell System
          </p>
          <div className="h-px w-12 bg-indigo-900"></div>
        </div>
        <p className="text-[9px] uppercase tracking-widest font-mono text-indigo-900/40">
          Powered by Gemini AI Technology
        </p>
      </footer>
    </div>
  );
}
