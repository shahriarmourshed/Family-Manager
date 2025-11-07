
import { NextResponse } from 'next/server';
import type { UserSettings, Income, Expense, Product, FamilyMember } from '@/lib/types';
import { differenceInDays, parseISO, setYear as setYearDate, isFuture, format } from 'date-fns';
import { headers } from 'next/headers';
import * as admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

// This function can be triggered by a cron job service.
export async function GET(request: Request) {
  // Dynamically import admin-sdk to prevent build errors
  const { adminDb, adminAuth } = await import('@/lib/firebase-admin');
  const { getMessaging } = await import('firebase-admin/messaging');
  
  const headersList = headers();
  const triggerType = headersList.get('X-Trigger-Type');
  const authToken = (headersList.get('authorization') || '').split('Bearer ')[1];

  let userIdToProcess: string | null = null;

  if (triggerType === 'manual') {
      if (!authToken) {
          return new NextResponse(JSON.stringify({ message: 'Missing Firebase ID token.' }), { status: 401 });
      }
      try {
          const decodedToken = await adminAuth.verifyIdToken(authToken);
          userIdToProcess = decodedToken.uid;
          console.log(`Manual trigger for user: ${userIdToProcess}`);
      } catch (error) {
          console.error('Error verifying Firebase ID token:', error);
          return new NextResponse(JSON.stringify({ message: 'Invalid Firebase ID token.' }), { status: 403 });
      }
  } else {
      const authHeader = headersList.get('authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
          return new NextResponse('Unauthorized', { status: 401 });
      }
      console.log('Scheduled cron job running...');
  }


  try {
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    console.log(`Cron job running at server time: ${currentTime}`);
    
    let usersQuery: admin.firestore.Query<admin.firestore.DocumentData> = adminDb.collection('users');
    if (userIdToProcess) {
        usersQuery = usersQuery.where(admin.firestore.FieldPath.documentId(), '==', userIdToProcess);
    }
    const usersSnapshot = await usersQuery.get();

    const sendNotification = async (tokens: string[], title: string, body: string) => {
      if (tokens.length === 0) return;

      const message = {
        notification: { title, body },
        tokens: tokens,
      };
      
      try {
        const response = await getMessaging().sendEachForMulticast(message);
        console.log(`Successfully sent ${response.successCount} messages`);
        if (response.failureCount > 0) {
            const failedTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                }
            });
            console.log('List of tokens that caused failures:', failedTokens);
        }
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }

    let notificationsSent = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const settingsDoc = await adminDb.collection('users').doc(userId).collection('settings').doc('main').get();
      
      if (!settingsDoc.exists) continue;

      const settings = settingsDoc.data() as UserSettings;

      if (!settings.fcmTokens || settings.fcmTokens.length === 0 || !settings.notificationSettings) continue;

      const { transactions, lowStock, events } = settings.notificationSettings;
      const isManualTrigger = !!userIdToProcess;

      // Check for upcoming transactions
      if (transactions?.enabled && (transactions.time === currentTime || isManualTrigger)) {
        const reminderDays = transactions.reminderDays || 3;
        const upcomingTxs = await getUpcomingTransactions(userId, reminderDays);
        if (upcomingTxs.length > 0) {
          const body = `You have ${upcomingTxs.length} upcoming transaction(s) due soon.`;
          await sendNotification(settings.fcmTokens, "Upcoming Transactions", body);
          notificationsSent++;
        }
      }
      
      // Check for low stock products
      if (lowStock?.enabled && (lowStock.time === currentTime || isManualTrigger)) {
        const products = await getLowStockProducts(userId);
        if (products.length > 0) {
          const body = `You have ${products.length} product(s) running low on stock.`;
          await sendNotification(settings.fcmTokens, "Low Stock Alert", body);
          notificationsSent++;
        }
      }

      // Check for upcoming events
      if (events?.enabled && (events.time === currentTime || isManualTrigger)) {
        const daysBefore = events.daysBefore || 1;
        const upcomingEvents = await getUpcomingEvents(userId, daysBefore);
        if (upcomingEvents.length > 0) {
          const body = `You have ${upcomingEvents.length} upcoming family event(s) in the next ${daysBefore === 1 ? 'day' : `${daysBefore} days`}.`;
          await sendNotification(settings.fcmTokens, "Upcoming Family Events", body);
          notificationsSent++;
        }
      }
    }
    
    const message = userIdToProcess 
        ? `Manual check complete. Found and sent ${notificationsSent} notifications for you.`
        : 'Scheduled cron job executed successfully.';

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error("Error in cron job:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500 });
  }
}


// --- Data fetching functions ---

async function getUpcomingTransactions(userId: string, reminderDays: number): Promise<(Income | Expense)[]> {
    const { adminDb } = await import('@/lib/firebase-admin');
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const incomesSnapshot = await adminDb.collection('users').doc(userId).collection('incomes').where('status', '==', 'planned').get();
    const expensesSnapshot = await adminDb.collection('users').doc(userId).collection('expenses').where('status', '==', 'planned').get();

    const allTransactions = [
        ...incomesSnapshot.docs.map(doc => doc.data() as Income),
        ...expensesSnapshot.docs.map(doc => doc.data() as Expense)
    ];
    
    const upcoming = allTransactions.filter(t => {
        try {
            const transactionDate = parseISO(t.date);
            return isFuture(transactionDate) && differenceInDays(transactionDate, today) <= reminderDays;
        } catch (e) {
            console.error(`Invalid date format for transaction ${t.id}: ${t.date}`);
            return false;
        }
    });

    return upcoming;
}

async function getLowStockProducts(userId: string): Promise<Product[]> {
    const { adminDb } = await import('@/lib/firebase-admin');
    const productsSnapshot = await adminDb.collection('users').doc(userId).collection('products').get();
    const products = productsSnapshot.docs.map(doc => doc.data() as Product);

    return products.filter(p => p.lowStockThreshold !== undefined && p.currentStock <= p.lowStockThreshold);
}

async function getUpcomingEvents(userId: string, daysBefore: number): Promise<any[]> {
    const { adminDb } = await import('@/lib/firebase-admin');
    const familySnapshot = await adminDb.collection('users').doc(userId).collection('familyMembers').get();
    const familyMembers = familySnapshot.docs.map(doc => doc.data() as FamilyMember);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    const events = [];

    for (const member of familyMembers) {
        const checkEvent = (dateStr: string | undefined, eventName: string) => {
            if (!dateStr) return;
            try {
                const eventDate = parseISO(dateStr);
                let nextEvent = setYearDate(eventDate, currentYear);
                if (nextEvent < today) {
                    nextEvent = setYearDate(eventDate, currentYear + 1);
                }
                const daysLeft = differenceInDays(nextEvent, today);
                if (daysLeft >= 0 && daysLeft <= daysBefore) {
                    events.push({
                        member,
                        eventName,
                        eventDate: nextEvent,
                        daysLeft,
                    });
                }
            } catch (e) {
                console.error(`Invalid date for ${eventName} for member ${member.name}: ${dateStr}`);
            }
        };

        checkEvent(member.birthday, `${member.name}'s Birthday`);
        if(member.specialEventName) {
            checkEvent(member.specialEventDate, member.specialEventName);
        }
    }

    return events.sort((a, b) => a.daysLeft - b.daysLeft);
}
