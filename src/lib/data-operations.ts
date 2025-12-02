

'use client';

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  setDoc,
  writeBatch,
  getDocs,
  doc,
  DocumentData,
  CollectionReference,
  getDoc,
  where,
  arrayUnion,
} from 'firebase/firestore';
import type { Expense, FamilyMember, Product, Income, ExpenseCategory, UserSettings, NotificationSettings } from '@/lib/types';
import { db } from '@/lib/firebase';
import {
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  format,
  lastDayOfMonth,
  subMonths,
  addMonths,
  startOfMonth,
  endOfMonth,
} from 'date-fns';

// Helper to remove undefined values from an object
const cleanUndefined = (obj: any) => {
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      newObj[key] = obj[key];
    }
  });
  return newObj;
};

// Generic function to get collection reference
const getCollectionRef = (
  userId: string | null,
  collectionName: string
): CollectionReference<DocumentData> | null => {
  if (!userId) return null;
  return collection(db, `users/${userId}/${collectionName}`);
};

export const calculateAutoReducedStock = (product: Product): Product => {
    if (!product.consumptionRate || !product.consumptionPeriod || !product.lastUpdated) {
        return product;
    }

    const now = new Date();
    const lastUpdatedDate = new Date(product.lastUpdated);
    let periodsPassed = 0;

    switch (product.consumptionPeriod) {
        case 'daily':
            periodsPassed = differenceInDays(now, lastUpdatedDate);
            break;
        case 'weekly':
            periodsPassed = differenceInWeeks(now, lastUpdatedDate);
            break;
        case 'half-monthly':
            periodsPassed = Math.floor(differenceInDays(now, lastUpdatedDate) / 14);
            break;
        case 'monthly':
            periodsPassed = differenceInMonths(now, lastUpdatedDate);
            break;
    }

    if (periodsPassed > 0) {
        const consumedAmount = periodsPassed * product.consumptionRate;
        const newStock = Math.max(0, product.currentStock - consumedAmount);
        return { ...product, currentStock: newStock };
    }

    return product;
};

export const generateRecurrentTransactions = <T extends Income | Expense>(
  transactions: T[],
  endDate: Date
): T[] => {
  const futureTransactions: T[] = [];
  const allIds = new Set(transactions.map(t => t.id));

  const recurrentPlanned = transactions.filter(
    t => t.recurrent && t.status === 'planned' && !t.plannedId
  );
  
  recurrentPlanned.forEach(t => {
      let nextDate = addMonths(new Date(t.date), 1);
      const recurrenceEndDate = t.recurrenceEndDate ? new Date(t.recurrenceEndDate) : null;
      
      while (nextDate <= endDate) {
          if (recurrenceEndDate && nextDate > recurrenceEndDate) {
              break;
          }
        
          const year = nextDate.getFullYear();
          const month = nextDate.getMonth();

          const transactionForMonthExists = transactions.some(existingTx => 
              existingTx.plannedId === t.id && 
              new Date(existingTx.date).getFullYear() === year &&
              new Date(existingTx.date).getMonth() === month
          );

          if (!transactionForMonthExists) {
              const newId = `${t.id}-rec-${format(nextDate, 'yyyy-MM')}`;
              if (!allIds.has(newId)) {
                  futureTransactions.push({
                      ...t,
                      id: newId,
                      date: format(nextDate, 'yyyy-MM-dd'),
                      plannedId: t.id,
                      isRecurrentProjection: true,
                  } as T & { isRecurrentProjection: boolean });
                  allIds.add(newId);
              }
          }
          nextDate = addMonths(nextDate, 1);
      }
  });

  return futureTransactions;
};

// Settings Operations
export const getSettings = async (userId: string): Promise<UserSettings> => {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'main');
    const docSnap = await getDoc(settingsDocRef);

    const defaultSettings: UserSettings = {
        savingGoal: 0,
        notificationSettings: {
            transactions: { enabled: false, time: '09:00', reminderDays: 3 },
            lowStock: { enabled: false, time: '10:00' },
            events: { enabled: false, time: '11:00', daysBefore: 3 },
        },
        fcmTokens: [],
    };
    
    if (docSnap.exists()) {
        const data = docSnap.data() as Partial<UserSettings & {reminderDays: number}>;
        // Merge with defaults to ensure all fields are present
        const mergedSettings: UserSettings = {
            ...defaultSettings,
            ...data,
            notificationSettings: {
                ...defaultSettings.notificationSettings,
                ...(data.notificationSettings || {}),
                 transactions: {
                    ...defaultSettings.notificationSettings.transactions,
                    ...(data.notificationSettings?.transactions || {}),
                },
                lowStock: {
                    ...defaultSettings.notificationSettings.lowStock,
                    ...(data.notificationSettings?.lowStock || {}),
                },
                events: {
                    ...defaultSettings.notificationSettings.events,
                    ...(data.notificationSettings?.events || {}),
                },
            }
        };
        // Handle legacy reminderDays
        if (data.reminderDays && !data.notificationSettings?.transactions?.reminderDays) {
            mergedSettings.notificationSettings.transactions.reminderDays = data.reminderDays;
        }
        return mergedSettings;

    } else {
        await setDoc(settingsDocRef, defaultSettings);
        return defaultSettings;
    }
};

export const updateSettings = async (userId: string, settings: Partial<UserSettings>) => {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'main');
    await setDoc(settingsDocRef, settings, { merge: true });
};

export const addFcmTokenOp = async (userId: string, token: string) => {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'main');
    await updateDoc(settingsDocRef, {
        fcmTokens: arrayUnion(token)
    });
};


// Expense Operations
export const addExpenseOp = async (userId: string, expense: Omit<Expense, 'id'>) => {
  const collectionRef = getCollectionRef(userId, 'expenses');
  if (!collectionRef) return;
  const docRef = doc(collectionRef);
  const newExpense = { ...expense, id: docRef.id, createdAt: Timestamp.now() };
  await setDoc(docRef, newExpense);
};

export const updateExpenseOp = async (userId: string, updatedExpense: Expense) => {
  const { id, ...dataToUpdate } = updatedExpense as any;
  const docRef = doc(db, `users/${userId}/expenses`, id);
  await updateDoc(docRef, { ...dataToUpdate, edited: true });
};

export const deleteExpenseOp = async (userId: string, expenseToDelete: Expense) => {
    const baseId = (expenseToDelete as any).isRecurrentProjection ? expenseToDelete.plannedId! : expenseToDelete.id;
    const baseDocRef = doc(db, `users/${userId}/expenses`, baseId);
    
    const deletionDate = new Date(expenseToDelete.date);
    const monthBeforeDeletion = subMonths(deletionDate, 1);
    const endRecurrenceDate = format(lastDayOfMonth(monthBeforeDeletion), 'yyyy-MM-dd');

    await updateDoc(baseDocRef, {
      recurrenceEndDate: endRecurrenceDate
    });
};

// Income Operations
export const addIncomeOp = async (userId: string, income: Omit<Income, 'id'>) => {
  const collectionRef = getCollectionRef(userId, 'incomes');
  if (!collectionRef) return;
  const docRef = doc(collectionRef);
  const newIncome = { ...income, id: docRef.id, createdAt: Timestamp.now() };
  await setDoc(docRef, newIncome);
};

export const updateIncomeOp = async (userId: string, updatedIncome: Income) => {
  const { id, ...dataToUpdate } = updatedIncome as any;
  const docRef = doc(db, `users/${userId}/incomes`, id);
  await updateDoc(docRef, { ...dataToUpdate, edited: true });
};

export const deleteIncomeOp = async (userId: string, incomeToDelete: Income) => {
    const baseId = (incomeToDelete as any).isRecurrentProjection ? incomeToDelete.plannedId! : incomeToDelete.id;
    const baseDocRef = doc(db, `users/${userId}/incomes`, baseId);
    
    const deletionDate = new Date(incomeToDelete.date);
    const monthBeforeDeletion = subMonths(deletionDate, 1);
    const endRecurrenceDate = format(lastDayOfMonth(monthBeforeDeletion), 'yyyy-MM-dd');

    await updateDoc(baseDocRef, {
      recurrenceEndDate: endRecurrenceDate
    });
};

// Product Operations
export const addProductOp = async (userId: string, product: Omit<Product, 'id' | 'lastUpdated' | 'createdAt'>) => {
  const collectionRef = getCollectionRef(userId, 'products');
  if (!collectionRef) return;
  const docRef = doc(collectionRef);
  const cleanedProduct = cleanUndefined(product);
  const newProduct = {
    ...cleanedProduct,
    id: docRef.id,
    lastUpdated: new Date().toISOString(),
    createdAt: Timestamp.now(),
  };
  await setDoc(docRef, newProduct);
};

export const updateProductOp = async (userId: string, product: Product) => {
  const { id, ...dataToUpdate } = product;
  const cleanedData = cleanUndefined(dataToUpdate);
  const docRef = doc(db, `users/${userId}/products`, id);
  await updateDoc(docRef, { ...cleanedData, lastUpdated: new Date().toISOString() });
};

export const deleteProductOp = async (userId: string, productId: string) => {
  const docRef = doc(db, `users/${userId}/products`, productId);
  await deleteDoc(docRef);
};

export const clearProductsOp = async (userId: string) => {
    const collectionRef = getCollectionRef(userId, 'products');
    if (!collectionRef) return;
    const snapshot = await getDocs(collectionRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
};

// Family Member Operations
export const addFamilyMemberOp = async (userId: string, member: Omit<FamilyMember, 'id' | 'createdAt'>) => {
  const collectionRef = getCollectionRef(userId, 'familyMembers');
  if (!collectionRef) return;
  const docRef = doc(collectionRef);
  const newMember = { ...member, id: docRef.id, createdAt: Timestamp.now() };
  await setDoc(docRef, newMember);
};

export const updateFamilyMemberOp = async (userId: string, member: FamilyMember) => {
  const { id, ...dataToUpdate } = member;
  const docRef = doc(db, `users/${userId}/familyMembers`, id);
  await updateDoc(docRef, dataToUpdate);
};

export const deleteFamilyMemberOp = async (userId: string, memberId: string) => {
  const docRef = doc(db, `users/${userId}/familyMembers`, memberId);
  await deleteDoc(docRef);
};

export const clearFamilyMembersOp = async (userId: string) => {
    const collectionRef = getCollectionRef(userId, 'familyMembers');
    if (!collectionRef) return;
    const snapshot = await getDocs(collectionRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
};

// Transaction Actions
export const completePlannedTransactionOp = async (userId: string, transaction: Income | Expense, type: 'income' | 'expense', actualAmount?: number) => {
    const collectionRef = type === 'income' ? getCollectionRef(userId, 'incomes') : getCollectionRef(userId, 'expenses');
    if (!collectionRef) return;
    
    const originalPlannedId = (transaction as any).isRecurrentProjection ? transaction.plannedId : transaction.id;

    const { id, createdAt, isRecurrentProjection, ...restData } = transaction as any;

    const newActualTransaction = {
      ...restData,
      status: 'completed' as const,
      plannedId: originalPlannedId,
      plannedAmount: transaction.amount,
      amount: actualAmount ?? transaction.amount,
      date: new Date().toISOString().split('T')[0],
      createdAt: Timestamp.now(),
    };

    await addDoc(collectionRef, newActualTransaction);
};

export const cancelPlannedTransactionOp = async (userId: string, transaction: Income | Expense, type: 'income' | 'expense') => {
    const collectionRef = type === 'income' ? getCollectionRef(userId, 'incomes') : getCollectionRef(userId, 'expenses');
    if (!collectionRef) return;
    
    const originalPlannedId = (transaction as any).isRecurrentProjection ? transaction.plannedId : transaction.id;

    const { id, createdAt, isRecurrentProjection, ...restData } = transaction as any;


    const newCancelledTransaction = {
        ...restData,
        status: 'cancelled' as const,
        plannedId: originalPlannedId,
        plannedAmount: transaction.amount,
        date: new Date().toISOString().split('T')[0],
        createdAt: Timestamp.now(),
    };
    await addDoc(collectionRef, newCancelledTransaction);
};

// Clear All Data
export const clearAllUserDataOp = async (userId: string) => {
    const collectionsToDelete = ['expenses', 'incomes', 'products', 'familyMembers', 'expenseCategories', 'incomeCategories'];
    const batch = writeBatch(db);

    for (const collectionName of collectionsToDelete) {
        const collectionRef = getCollectionRef(userId, collectionName);
        if (collectionRef) {
            const snapshot = await getDocs(collectionRef);
            snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        }
    }
    
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'main');
    batch.delete(settingsDocRef);
    
    await batch.commit();
};

export const clearMonthDataOp = async (userId: string, year: number, month: number) => {
    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(new Date(year, month));
    const startDateString = format(startDate, 'yyyy-MM-dd');
    const endDateString = format(endDate, 'yyyy-MM-dd');

    const collectionsToClear = ['expenses', 'incomes'];
    const batch = writeBatch(db);

    for (const collectionName of collectionsToClear) {
        const collectionRef = getCollectionRef(userId, collectionName);
        if (!collectionRef) continue;

        const q = query(
            collectionRef,
            where('date', '>=', startDateString),
            where('date', '<=', endDateString)
        );

        const snapshot = await getDocs(q);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
    }

    await batch.commit();
};

// Expense Category Operations
export const addExpenseCategoryOp = async (userId: string, categoryName: string) => {
  const collectionRef = getCollectionRef(userId, 'expenseCategories');
  if (!collectionRef) return;
  const docRef = doc(collectionRef);
  const newCategory = {
    id: docRef.id,
    name: categoryName,
    isDefault: false,
    createdAt: Timestamp.now(),
  };
  await setDoc(docRef, newCategory);
};

export const deleteExpenseCategoryOp = async (userId: string, categoryId: string) => {
  const docRef = doc(db, `users/${userId}/expenseCategories`, categoryId);
  await deleteDoc(docRef);
};

// Income Category Operations
export const addIncomeCategoryOp = async (userId: string, categoryName: string) => {
  const collectionRef = getCollectionRef(userId, 'incomeCategories');
  if (!collectionRef) return;
  const docRef = doc(collectionRef);
  const newCategory = {
    id: docRef.id,
    name: categoryName,
    isDefault: false,
    createdAt: Timestamp.now(),
  };
  await setDoc(docRef, newCategory);
};

export const deleteIncomeCategoryOp = async (userId: string, categoryId: string) => {
  const docRef = doc(db, `users/${userId}/incomeCategories`, categoryId);
  await deleteDoc(docRef);
};
