export interface ScheduleItem {
  id: string;
  period: number;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  teacher: string;
  gender: 'Bapak' | 'Ibu';
  subject: string;
  className: string;
  isActive: boolean;
}

export interface AppSettings {
  schoolName: string;
  isAutoEnabled: boolean;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
}
