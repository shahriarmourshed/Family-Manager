

export type FamilyMember = {
  id: string;
  name: string;
  avatarUrl: string;
  birthday: string; // ISO string date
  height: number; // in total inches
  weight: number; // in kg
  healthConditions: string;
  dietaryRestrictions: string;
  specialEventName?: string;
  specialEventDate?: string; // ISO string date
  createdAt?: any;
};

export type Product = {
  id: string;
  name:string;
  quantity: number; // Represents the last purchased quantity
  currentStock: number;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack' | 'dozen' | 'box' | 'bottle' | 'can' | 'roll';
  price: number;
  purchaseDate: string;
  consumptionRate?: number;
  consumptionPeriod?: 'daily' | 'weekly' | 'half-monthly' | 'monthly';
  lowStockThreshold?: number;
  lastUpdated: string; // ISO string to track when stock was last updated
  createdAt?: any;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  isDefault?: boolean;
  createdAt?: any;
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  recurrent: boolean;
  recurrenceEndDate?: string;
  notes?: string;
  status: 'planned' | 'completed' | 'cancelled';
  plannedAmount?: number;
  plannedId?: string; // ID of the original planned transaction
  edited?: boolean;
  createdAt?: any;
};

export type IncomeCategory = {
  id: string;
  name: string;
  isDefault?: boolean;
  createdAt?: any;
};

export type Income = {
  id:string;
  description: string;
  amount: number;
  category: string;
  date: string;
  recurrent: boolean;
  recurrenceEndDate?: string;
  notes?: string;
  status: 'planned' | 'completed' | 'cancelled';
  plannedAmount?: number;
  plannedId?: string; // ID of the original planned transaction
  edited?: boolean;
  createdAt?: any;
};

export type Budget = {
  total: number;
  spent: number;
  categories: {
    name: string;
    amount: number;
  }[];
};

export type NotificationSettings = {
  transactions: {
    enabled: boolean;
    time: string; // "HH:mm"
    reminderDays: number;
  };
  lowStock: {
    enabled: boolean;
    time: string; // "HH:mm"
  };
  events: {
    enabled: boolean;
    time: string; // "HH:mm"
    daysBefore: number;
  };
};

export type UserSettings = {
  savingGoal: number;
  notificationSettings: NotificationSettings;
  fcmTokens: string[];
};
