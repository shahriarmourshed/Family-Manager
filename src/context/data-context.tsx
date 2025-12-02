

'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Expense, FamilyMember, Product, Income, ExpenseCategory, IncomeCategory, UserSettings, NotificationSettings } from '@/lib/types';
import { useAuth } from './auth-context';
import { db } from '@/lib/firebase';
import { onSnapshot, collection, query, orderBy, writeBatch, getDocs, doc, deleteDoc, Timestamp } from "firebase/firestore";
import {
  calculateAutoReducedStock,
  generateRecurrentTransactions,
  getSettings,
  updateSettings,
  addFcmTokenOp,
  addExpenseOp,
  updateExpenseOp,
  deleteExpenseOp,
  addIncomeOp,
  updateIncomeOp,
  deleteIncomeOp,
  addProductOp,
  updateProductOp,
  deleteProductOp,
  clearProductsOp,
  addFamilyMemberOp,
  updateFamilyMemberOp,
  deleteFamilyMemberOp,
  clearFamilyMembersOp,
  completePlannedTransactionOp,
  cancelPlannedTransactionOp,
  clearAllUserDataOp,
  clearMonthDataOp,
  addExpenseCategoryOp,
  deleteExpenseCategoryOp,
  addIncomeCategoryOp,
deleteIncomeCategoryOp,
} from '@/lib/data-operations';

const DEFAULT_EXPENSE_CATEGORIES: Omit<ExpenseCategory, 'id' | 'createdAt'>[] = [
    { name: 'Groceries', isDefault: true },
    { name: 'Bills', isDefault: true },
    { name: 'Housing', isDefault: true },
    { name: 'Transport', isDefault: true },
    { name: 'Health', isDefault: true },
    { name: 'Education', isDefault: true },
    { name: 'Entertainment', isDefault: true },
    { name: 'Personal Care', isDefault: true },
    { name: 'Other', isDefault: true },
];

const DEFAULT_INCOME_CATEGORIES: Omit<IncomeCategory, 'id' | 'createdAt'>[] = [
    { name: 'Salary', isDefault: true },
    { name: 'Business', isDefault: true },
    { name: 'Investment', isDefault: true },
    { name: 'Gift', isDefault: true },
    { name: 'Other', isDefault: true },
];

const DEFAULT_SETTINGS: UserSettings = {
    savingGoal: 0,
    notificationSettings: {
        transactions: { enabled: false, time: '09:00', reminderDays: 3 },
        lowStock: { enabled: false, time: '10:00' },
        events: { enabled: false, time: '11:00', daysBefore: 3 },
    },
    fcmTokens: [],
    lastSeenNotifications: null,
};


interface DataContextType {
  expenses: Expense[];
  products: Product[];
  incomes: Income[];
  familyMembers: FamilyMember[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  settings: UserSettings;
  lastSeenNotifications: Date | null;
  updateLastSeenNotifications: () => void;
  setSavingGoal: (goal: number) => void;
  setNotificationSettings: (settings: NotificationSettings) => void;
  addFcmToken: (token: string) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id'>, status?: Expense['status']) => Promise<void>;
  updateExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'lastUpdated' | 'createdAt'>) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  clearProducts: () => Promise<void>;
  addIncome: (income: Omit<Income, 'id'>, status?: Income['status']) => Promise<void>;
  updateIncome: (income: Income) => Promise<void>;
  deleteIncome: (incomeId: string) => Promise<void>;
  addFamilyMember: (member: Omit<FamilyMember, 'id' | 'createdAt'>) => Promise<void>;
  updateFamilyMember: (member: FamilyMember) => Promise<void>;
  deleteFamilyMember: (memberId: string) => Promise<void>;
  clearFamilyMembers: () => Promise<void>;
  addExpenseCategory: (categoryName: string) => Promise<void>;
  deleteExpenseCategory: (categoryId: string) => Promise<void>;
  addIncomeCategory: (categoryName: string) => Promise<void>;
  deleteIncomeCategory: (categoryId: string) => Promise<void>;
  completePlannedTransaction: (transaction: Income | Expense, type: 'income' | 'expense', actualAmount?: number) => Promise<void>;
  cancelPlannedTransaction: (transaction: Income | Expense, type: 'income' | 'expense') => Promise<void>;
  clearAllUserData: () => Promise<void>;
  clearMonthData: (year: number, month: number) => Promise<void>;
  loading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<IncomeCategory[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [lastSeenNotifications, setLastSeenNotifications] = useState<Date | null>(null);

  const userId = user?.uid || null;

  useEffect(() => {
    if (userId) {
        const storedTimestamp = localStorage.getItem(`lastSeenNotifications_${userId}`);
        if (storedTimestamp) {
            setLastSeenNotifications(new Date(storedTimestamp));
        }
    } else {
        setLastSeenNotifications(null);
    }
  }, [userId]);

  const updateLastSeenNotifications = useCallback(() => {
    if (!userId) return;
    const now = new Date();
    setLastSeenNotifications(now);
    localStorage.setItem(`lastSeenNotifications_${userId}`, now.toISOString());
  }, [userId]);

  const processDoc = (doc: any) => {
    const data = doc.data();
    // Convert Firestore Timestamps to JS Dates
    if (data.createdAt && data.createdAt.toDate) {
      data.createdAt = data.createdAt.toDate();
    }
    return { id: doc.id, ...data };
  };

  // Fetch initial data and set up listeners
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      // Reset states when user logs out
      setExpenses([]);
      setIncomes([]);
      setProducts([]);
      setFamilyMembers([]);
      setExpenseCategories([]);
      setIncomeCategories([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    
    setLoading(true);
    const unsubscribes: (() => void)[] = [];

    const setupSubscription = (collectionName: string, setter: React.Dispatch<React.SetStateAction<any[]>>, processData?: (data: any[]) => any[]) => {
        const collectionRef = collection(db, `users/${userId}/${collectionName}`);
        const q = query(collectionRef, orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let data = snapshot.docs.map(processDoc);

             if (collectionName === 'incomes' || collectionName === 'expenses') {
                const futureDate = new Date();
                futureDate.setFullYear(futureDate.getFullYear() + 5);
                const recurrent = generateRecurrentTransactions(data, futureDate);
                data = [...data, ...recurrent];
            }
            
            if (collectionName === 'expenseCategories') {
                const customCategories = data;
                const defaultCategories = DEFAULT_EXPENSE_CATEGORIES.map((cat, index) => ({ ...cat, id: `default-${index}`, createdAt: new Date(0) }));
                const combined = [...defaultCategories, ...customCategories].sort((a, b) => a.name.localeCompare(b.name));
                const unique = combined.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                data = unique;

                if (snapshot.empty) {
                    setter(defaultCategories);
                } else {
                    setter(data);
                }
            } else if (collectionName === 'incomeCategories') {
                const customCategories = data;
                const defaultCategories = DEFAULT_INCOME_CATEGORIES.map((cat, index) => ({ ...cat, id: `default-${index}`, createdAt: new Date(0) }));
                const combined = [...defaultCategories, ...customCategories].sort((a, b) => a.name.localeCompare(b.name));
                const unique = combined.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                data = unique;

                if (snapshot.empty) {
                    setter(defaultCategories);
                } else {
                    setter(data);
                }
            } else {
               if (processData) {
                  data = processData(data);
                }
                setter(data);
            }

            setLoading(false);
        }, (error) => {
            console.error(`Error fetching ${collectionRef.path}:`, error);
            setLoading(false);
        });
        unsubscribes.push(unsubscribe);
    };

    setupSubscription('expenses', setExpenses);
    setupSubscription('incomes', setIncomes);
    setupSubscription('products', setProducts, (data) => data.map(calculateAutoReducedStock));
    setupSubscription('familyMembers', setFamilyMembers);
    setupSubscription('expenseCategories', setExpenseCategories);
    setupSubscription('incomeCategories', setIncomeCategories);
    
    getSettings(userId).then(settings => {
      const lastSeen = settings.lastSeenNotifications;
      if(lastSeen && (lastSeen as any).toDate) {
        settings.lastSeenNotifications = (lastSeen as any).toDate();
      }
      setSettings(settings)
    });
    
    const settingsUnsub = onSnapshot(doc(db, 'users', userId, 'settings', 'main'), (doc) => {
        if(doc.exists()) {
            const remoteSettings = doc.data() as Partial<UserSettings>;
             if(remoteSettings.lastSeenNotifications && (remoteSettings.lastSeenNotifications as any).toDate) {
                remoteSettings.lastSeenNotifications = (remoteSettings.lastSeenNotifications as any).toDate();
            }

            setSettings(prevSettings => {
                 const newSettings = {
                    ...DEFAULT_SETTINGS,
                    ...prevSettings,
                    ...remoteSettings,
                    notificationSettings: {
                        ...DEFAULT_SETTINGS.notificationSettings,
                        ...(prevSettings.notificationSettings || {}),
                        ...(remoteSettings.notificationSettings || {}),
                        transactions: {
                            ...DEFAULT_SETTINGS.notificationSettings.transactions,
                            ...(prevSettings.notificationSettings?.transactions || {}),
                            ...(remoteSettings.notificationSettings?.transactions || {}),
                        },
                        lowStock: {
                             ...DEFAULT_SETTINGS.notificationSettings.lowStock,
                            ...(prevSettings.notificationSettings?.lowStock || {}),
                            ...(remoteSettings.notificationSettings?.lowStock || {}),
                        },
                        events: {
                            ...DEFAULT_SETTINGS.notificationSettings.events,
                            ...(prevSettings.notificationSettings?.events || {}),
                            ...(remoteSettings.notificationSettings?.events || {}),
                        }
                    }
                };
                
                return newSettings;
            });
        }
    });
    unsubscribes.push(settingsUnsub);


    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userId]);

  const setSavingGoal = async (goal: number) => {
    if (!userId) return;
    setSettings(s => ({...s, savingGoal: goal})); // Optimistic update
    await updateSettings(userId, { savingGoal: goal });
  }
  
  const setNotificationSettings = async (notificationSettings: NotificationSettings) => {
    if (!userId) return;
    setSettings(s => ({...s, notificationSettings})); // Optimistic update
    await updateSettings(userId, { notificationSettings });
  }
  
  const addFcmToken = async (token: string) => {
    if (!userId) return;
    setSettings(s => ({...s, fcmTokens: [...new Set([...s.fcmTokens, token])]})); // Optimistic update
    await addFcmTokenOp(userId, token);
  }
  
  const addExpense = async (expense: Omit<Expense, 'id'>, status: Expense['status'] = 'planned') => {
    if (!userId) return;
    const newExpense = { ...expense, status };
    await addExpenseOp(userId, newExpense);
  };
  
  const updateExpense = async (updatedExpense: Expense) => {
      if (!userId) return;

      if ((updatedExpense as any).isRecurrentProjection) {
        const { id, isRecurrentProjection, createdAt, ...data } = updatedExpense as any;
        addExpense({ ...data, recurrent: false, edited: true }, 'planned');
        return;
      }
      
      await updateExpenseOp(userId, updatedExpense);
  };
  
  const deleteExpense = async (expenseId: string) => {
    if (!userId) return;
    const expenseToDelete = expenses.find(e => e.id === expenseId);
    if (!expenseToDelete) return;

    if (!expenseToDelete.recurrent) {
        await deleteDoc(doc(db, `users/${userId}/expenses`, expenseId));
        return;
    }
    await deleteExpenseOp(userId, expenseToDelete);
  };

  const addProduct = async (product: Omit<Product, 'id' | 'lastUpdated' | 'createdAt'>) => {
      if (!userId) return;
      await addProductOp(userId, product);
  };

  const updateProduct = async (updatedProduct: Product) => {
      if (!userId) return;
      await updateProductOp(userId, updatedProduct);
  };

  const deleteProduct = async (productId: string) => {
    if (!userId) return;
    await deleteProductOp(userId, productId);
  };
  
  const clearProducts = async () => {
    if (!userId) return;
    await clearProductsOp(userId);
  };

  const addIncome = async (income: Omit<Income, 'id'>, status: Income['status'] = 'planned') => {
      if (!userId) return;
      await addIncomeOp(userId, {...income, status});
  };

  const updateIncome = async (updatedIncome: Income) => {
    if (!userId) return;
    
    if ((updatedIncome as any).isRecurrentProjection) {
        const { id, isRecurrentProjection, createdAt, ...data } = updatedIncome as any;
        addIncome({ ...data, recurrent: false, edited: true }, 'planned');
        return;
    }

    await updateIncomeOp(userId, updatedIncome);
  };

  const deleteIncome = async (incomeId: string) => {
    if (!userId) return;
    const incomeToDelete = incomes.find(i => i.id === incomeId);
    if (!incomeToDelete) return;

    if (!incomeToDelete.recurrent) {
        await deleteDoc(doc(db, `users/${userId}/incomes`, incomeId));
        return;
    }
    
    await deleteIncomeOp(userId, incomeToDelete);
  };
  
  const addFamilyMember = async (member: Omit<FamilyMember, 'id' | 'createdAt'>) => {
    if (!userId) return;
    await addFamilyMemberOp(userId, member);
  };

  const updateFamilyMember = async (member: FamilyMember) => {
    if (!userId) return;
    await updateFamilyMemberOp(userId, member);
  };

  const deleteFamilyMember = async (memberId: string) => {
    if (!userId) return;
    await deleteFamilyMemberOp(userId, memberId);
  };

  const clearFamilyMembers = async () => {
    if (!userId) return;
    await clearFamilyMembersOp(userId);
  };

  const addExpenseCategory = async (categoryName: string) => {
    if (!userId) return;
    await addExpenseCategoryOp(userId, categoryName);
  };

  const deleteExpenseCategory = async (categoryId: string) => {
    if (!userId) return;
    await deleteExpenseCategoryOp(userId, categoryId);
  };

  const addIncomeCategory = async (categoryName: string) => {
    if (!userId) return;
    await addIncomeCategoryOp(userId, categoryName);
  };

  const deleteIncomeCategory = async (categoryId: string) => {
    if (!userId) return;
    await deleteIncomeCategoryOp(userId, categoryId);
  };

  const clearAllUserData = async () => {
    if (!userId) return;
    await clearAllUserDataOp(userId);
  };
  
  const clearMonthData = async (year: number, month: number) => {
    if (!userId) return;
    await clearMonthDataOp(userId, year, month);
  };

  const completePlannedTransaction = async (transaction: Income | Expense, type: 'income' | 'expense', actualAmount?: number) => {
    if (!userId) return;
    await completePlannedTransactionOp(userId, transaction, type, actualAmount);
  };
  
  const cancelPlannedTransaction = async (transaction: Income | Expense, type: 'income' | 'expense') => {
    if (!userId) return;
    await cancelPlannedTransactionOp(userId, transaction, type);
  }


  const value = { 
    expenses, 
    products, 
    incomes, 
    familyMembers,
    expenseCategories,
    incomeCategories,
    settings,
    lastSeenNotifications,
    updateLastSeenNotifications,
    setSavingGoal, 
    setNotificationSettings,
    addFcmToken,
    addExpense, 
    updateExpense, 
    deleteExpense, 
    addProduct, 
    updateProduct,
    deleteProduct,
    clearProducts,
    addIncome, 
    updateIncome, 
    deleteIncome, 
    addFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
    clearFamilyMembers,
    addExpenseCategory,
    deleteExpenseCategory,
    addIncomeCategory,
    deleteIncomeCategory,
    clearAllUserData,
    clearMonthData,
    completePlannedTransaction, 
    cancelPlannedTransaction,
    loading,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

    