
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import PageHeader from "@/components/common/page-header";
import { useData } from '@/context/data-context';
import { useCurrency } from '@/context/currency-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { getYear, isFuture, differenceInDays, format, parseISO, setYear as setYearDate, differenceInDays as dateDiff } from 'date-fns';
import type { Income, Expense, Product } from '@/lib/types';
import { Bell, AlertCircle, Gift, Wallet, ShoppingBasket } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const { products, expenses, incomes, familyMembers, settings, loading } = useData();
  const { getSymbol } = useCurrency();

  const upcomingTransactions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const reminderDays = settings?.notificationSettings?.transactions?.reminderDays || 3;
    
    const upcoming = (t: Income | Expense) => {
        const transactionDate = new Date(t.date);
        return t.status === 'planned' && isFuture(transactionDate) && differenceInDays(transactionDate, today) <= reminderDays;
    }

    const combined = [
        ...expenses.filter(upcoming).map(t => ({...t, type: 'expense' as const})),
        ...incomes.filter(upcoming).map(t => ({...t, type: 'income' as const}))
    ];

    return combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [expenses, incomes, settings]);

  const lowStockProducts = useMemo(() => {
    return products.filter(p => 
        p.lowStockThreshold !== undefined && p.currentStock <= p.lowStockThreshold
    );
  }, [products]);
  
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    const reminderDays = settings?.notificationSettings?.events?.daysBefore || 7;
    const events = [];

    for (const member of familyMembers) {
      if (member.birthday) {
        try {
          const birthdayDate = parseISO(member.birthday);
          const nextBirthday = setYearDate(birthdayDate, currentYear);
          if (nextBirthday < today) {
            nextBirthday.setFullYear(currentYear + 1);
          }
          const daysLeft = dateDiff(nextBirthday, today);
          if (daysLeft >= 0 && daysLeft <= reminderDays) {
            events.push({
              member,
              eventName: 'Birthday',
              eventDate: nextBirthday,
              daysLeft: daysLeft,
            });
          }
        } catch (e) { console.error("Invalid birthday date for", member.name) }
      }
      if (member.specialEventDate && member.specialEventName) {
         try {
            const eventDate = parseISO(member.specialEventDate);
            const nextEvent = setYearDate(eventDate, currentYear);
            if (nextEvent < today) {
                nextEvent.setFullYear(currentYear + 1);
            }
             const daysLeft = dateDiff(nextEvent, today);
             if (daysLeft >= 0 && daysLeft <= reminderDays) {
                events.push({
                    member,
                    eventName: member.specialEventName,
                    eventDate: nextEvent,
                    daysLeft: daysLeft,
                });
             }
        } catch (e) { console.error("Invalid special event date for", member.name)}
      }
    }
    return events.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [familyMembers, settings]);

  const allNotifications = [
    ...upcomingTransactions.map(item => ({ ...item, notificationType: 'transaction' as const })),
    ...lowStockProducts.map(item => ({ ...item, notificationType: 'lowStock' as const })),
    ...upcomingEvents.map(item => ({ ...item, notificationType: 'event' as const })),
  ].sort((a, b) => {
      const dateA = a.notificationType === 'transaction' ? new Date(a.date) : a.notificationType === 'event' ? a.eventDate : new Date();
      const dateB = b.notificationType === 'transaction' ? new Date(b.date) : b.notificationType === 'event' ? b.eventDate : new Date();
      return dateA.getTime() - dateB.getTime();
  });


  return (
    <div className="container mx-auto">
      <PageHeader title="Notifications" subtitle="All your recent alerts and upcoming reminders." />

      <div className="px-4 sm:px-0 space-y-6">
        {allNotifications.length === 0 ? (
            <Card>
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <Bell className="w-16 h-16 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold">All Caught Up!</h3>
                    <p className="text-muted-foreground">You have no new notifications.</p>
                </CardContent>
            </Card>
        ) : (
            allNotifications.map((item, index) => {
                if (item.notificationType === 'transaction') {
                    return (
                        <Link href="/budget" key={`notif-${index}`}>
                            <Card className="hover:bg-muted/50 transition-colors">
                                <CardHeader className="flex flex-row items-start gap-4">
                                    <div className="p-3 bg-muted rounded-full"><Wallet className="h-5 w-5 text-primary"/></div>
                                    <div className="flex-1">
                                        <CardTitle className="text-base">Upcoming Transaction</CardTitle>
                                        <CardDescription>{item.description} is due on {format(new Date(item.date), 'MMMM do')}.</CardDescription>
                                    </div>
                                    <p className={cn(
                                        "font-semibold text-lg",
                                        item.type === 'income' ? 'text-green-500' : 'text-red-500'
                                    )}>
                                        {item.type === 'income' ? '+' : '-'}{getSymbol()}{item.amount.toLocaleString()}
                                    </p>
                                </CardHeader>
                            </Card>
                        </Link>
                    )
                }
                if (item.notificationType === 'lowStock') {
                    return (
                        <Link href="/products" key={`notif-${index}`}>
                            <Card className="hover:bg-muted/50 transition-colors">
                                <CardHeader className="flex flex-row items-start gap-4">
                                    <div className="p-3 bg-muted rounded-full"><ShoppingBasket className="h-5 w-5 text-amber-500"/></div>
                                    <div className="flex-1">
                                        <CardTitle className="text-base">Low Stock Alert</CardTitle>
                                        <CardDescription>{item.name} is running low. Only {item.currentStock.toFixed(1)} {item.unit} left.</CardDescription>
                                    </div>
                                </CardHeader>
                            </Card>
                        </Link>
                    )
                }
                if (item.notificationType === 'event') {
                    return (
                        <Link href="/family" key={`notif-${index}`}>
                            <Card className="hover:bg-muted/50 transition-colors">
                                <CardHeader className="flex flex-row items-start gap-4">
                                     <div className="p-3 bg-muted rounded-full"><Gift className="h-5 w-5 text-pink-500"/></div>
                                    <div className="flex-1">
                                        <CardTitle className="text-base">{item.member.name}'s {item.eventName}</CardTitle>
                                        <CardDescription>
                                            {item.daysLeft === 0 ? `Today is the day! It's on ${format(item.eventDate, 'MMMM do')}.` : 
                                            `It's coming up in ${item.daysLeft} day${item.daysLeft > 1 ? 's' : ''} on ${format(item.eventDate, 'MMMM do')}.`
                                            }
                                        </CardDescription>
                                    </div>
                                    <Image src={item.member.avatarUrl} alt={item.member.name} width={40} height={40} className="rounded-full" />
                                </CardHeader>
                            </Card>
                        </Link>
                    )
                }
                return null;
            })
        )}
      </div>
    </div>
  );
}
