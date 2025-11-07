
import { NextResponse } from 'next/server';
import type { UserSettings, Income, Expense, Product, FamilyMember } from '@/lib/types';
import { differenceInDays, parseISO, setYear as setYearDate, isFuture } from 'date-fns';

export const dynamic = 'force-dynamic';

// This function can be triggered by a cron job service.
export async function GET(request: Request) {
  // Dynamically import admin-sdk to prevent build errors
  const { adminDb } = await import('@/lib/firebase-admin');
  const { getMessaging } = await import('firebase-admin/messaging');
  
  // Authorization check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    console.log(`Cron job running at UTC: ${currentTime}`);

    const usersSnapshot = await adminDb.collection('users').get();

    const sendNotification = async (tokens: string[], title: string, body: string) => {
      if (tokens.length === 0) return;

      const message = {
        notification: { title, body },
        tokens: tokens,
      };
      
      try {
        const response = await getMessaging().sendMulticast(message);
        console.log('Successfully sent message:', response);
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

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const settingsDoc = await adminDb.collection('users').doc(userId).collection('settings').doc('main').get();
      
      if (!settingsDoc.exists) continue;

      const settings = settingsDoc.data() as UserSettings;

      if (!settings.fcmTokens || settings.fcmTokens.length === 0 || !settings.notificationSettings) continue;

      const { transactions, lowStock, events } = settings.notificationSettings;

      // Check for upcoming transactions
      if (transactions?.enabled && transactions.time === currentTime) {
        const reminderDays = transactions.reminderDays || 3;
        const upcomingTxs = await getUpcomingTransactions(userId, reminderDays);
        if (upcomingTxs.length > 0) {
          const body = `You have ${upcomingTxs.length} upcoming transaction(s) due soon.`;
          await sendNotification(settings.fcmTokens, "Upcoming Transactions", body);
        }
      }
      
      // Check for low stock products
      if (lowStock?.enabled && lowStock.time === currentTime) {
        const products = await getLowStockProducts(userId);
        if (products.length > 0) {
          const body = `You have ${products.length} product(s) running low on stock.`;
          await sendNotification(settings.fcmTokens, "Low Stock Alert", body);
        }
      }

      // Check for upcoming events
      if (events?.enabled && events.time === currentTime) {
        const daysBefore = events.daysBefore || 1;
        const upcomingEvents = await getUpcomingEvents(userId, daysBefore);
        if (upcomingEvents.length > 0) {
          const body = `You have ${upcomingEvents.length} upcoming family event(s) in the next ${daysBefore} days.`;
          await sendNotification(settings.fcmTokens, "Upcoming Family Events", body);
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Cron job executed successfully.' });
  } catch (error) {
    console.error("Error in cron job:", error);
    return new NextResponse('Internal Server Error', { status: 500 });
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
        const transactionDate = new Date(t.date);
        return isFuture(transactionDate) && differenceInDays(transactionDate, today) <= reminderDays;
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
                const nextEvent = setYearDate(eventDate, currentYear);
                if (nextEvent < today) {
                    nextEvent.setFullYear(currentYear + 1);
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
                console.error(`Invalid date for ${eventName} for member ${member.name}`);
            }
        };

        checkEvent(member.birthday, `${member.name}'s Birthday`);
        if(member.specialEventName) {
            checkEvent(member.specialEventDate, member.specialEventName);
        }
    }

    return events.sort((a, b) => a.daysLeft - b.daysLeft);
}

    