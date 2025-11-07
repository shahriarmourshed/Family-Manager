

'use client';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Utensils, ChevronRight, AlertCircle, Gift } from 'lucide-react';
import ExpenseChart from '@/components/budget/expense-chart';
import PageHeader from '@/components/common/page-header';
import { useCurrency } from '@/context/currency-context';
import { useData } from '@/context/data-context';
import { getYear, isFuture, differenceInDays, format, parseISO, setYear as setYearDate, differenceInDays as dateDiff } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Income, Expense, Product } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export default function DashboardPage() {
  const { getSymbol } = useCurrency();
  const { products, expenses, incomes, settings, addExpense, loading, familyMembers, expenseCategories } = useData();
  const [selectedYear, setSelectedYear] = useState(getYear(new Date()));

  // Dialog states
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);

  // Add Expense form state
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState('Other');
  const [newExpenseDate, setNewExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (newExpenseDesc && newExpenseAmount && newExpenseCategory && newExpenseDate) {
        addExpense({
            description: newExpenseDesc,
            amount: parseFloat(newExpenseAmount),
            category: newExpenseCategory,
            date: newExpenseDate,
            recurrent: false, 
        }, 'completed');
        resetAddExpenseForm();
    }
  };

  const resetAddExpenseForm = () => {
    setNewExpenseDesc('');
    setNewExpenseAmount('');
    setNewExpenseCategory('Other');
    setNewExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setIsExpenseDialogOpen(false);
  };


  const yearsWithData = useMemo(() => {
    const years = new Set<number>();
    [...incomes, ...expenses].forEach(t => years.add(getYear(new Date(t.date))));
    
    const currentYear = getYear(new Date());
    if (!years.has(currentYear)) {
        years.add(currentYear);
    }
    
    // Add years up to 2050
    for (let i = currentYear + 1; i <= 2050; i++) {
        years.add(i);
    }

    return Array.from(years).sort((a,b) => a - b);
  }, [incomes, expenses]);
  
  const { 
    filteredYearlyExpenses,
    totalYearlyIncome,
    totalYearlyExpenses
  } = useMemo(() => {
    const yearlyExpenses = expenses.filter(e => getYear(new Date(e.date)) === selectedYear && e.status === 'completed');
    const yearlyIncomes = incomes.filter(i => getYear(new Date(i.date)) === selectedYear && i.status === 'completed');

    const totalIncome = yearlyIncomes.reduce((sum, i) => sum + i.amount, 0);
    const totalExpensesValue = yearlyExpenses.reduce((sum, e) => sum + e.amount, 0);

    return { 
      filteredYearlyExpenses: yearlyExpenses,
      totalYearlyIncome: totalIncome,
      totalYearlyExpenses: totalExpensesValue,
    };
  }, [expenses, incomes, selectedYear]);

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
    const events = [];

    for (const member of familyMembers) {
      // Check for birthday
      if (member.birthday) {
        try {
          const birthdayDate = parseISO(member.birthday);
          const nextBirthday = setYearDate(birthdayDate, currentYear);
          if (nextBirthday < today) {
            nextBirthday.setFullYear(currentYear + 1);
          }
          if (dateDiff(nextBirthday, today) <= 365) {
            events.push({
              member,
              eventName: 'Birthday',
              eventDate: nextBirthday,
              daysLeft: dateDiff(nextBirthday, today),
            });
          }
        } catch (e) { console.error("Invalid birthday date for", member.name) }
      }
      // Check for special event
      if (member.specialEventDate && member.specialEventName) {
         try {
            const eventDate = parseISO(member.specialEventDate);
            const nextEvent = setYearDate(eventDate, currentYear);
            if (nextEvent < today) {
                nextEvent.setFullYear(currentYear + 1);
            }
             if (dateDiff(nextEvent, today) <= 365) {
                events.push({
                    member,
                    eventName: member.specialEventName,
                    eventDate: nextEvent,
                    daysLeft: dateDiff(nextEvent, today),
                });
             }
        } catch (e) { console.error("Invalid special event date for", member.name)}
      }
    }
    return events.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [familyMembers]);


  if (loading) {
      return (
          <div className="container mx-auto">
              <PageHeader title="Welcome to Family Manager!" subtitle="Your family's command center." />
              <div className="p-4 sm:p-0 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Skeleton className="lg:col-span-2 h-96" />
                  <Skeleton className="lg:col-span-1 h-96" />
                  <Skeleton className="lg:col-span-1 h-96" />
                  {lowStockProducts.length > 0 && <Skeleton className="lg:col-span-4 h-48" />}
                  <Skeleton className="lg:col-span-4 h-48" />
              </div>
          </div>
      )
  }

  return (
    <div className="container mx-auto">
      <PageHeader title="Welcome to Family Manager!" subtitle="Your family's command center." />
      
      <div className="grid gap-4 px-4 sm:px-0 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Financial Summary</CardTitle>
              <CardDescription>
                You had {getSymbol()}{totalYearlyIncome.toLocaleString()} in income vs. {getSymbol()}{totalYearlyExpenses.toLocaleString()} in expenses for {selectedYear}.
              </CardDescription>
            </div>
            <Select
                value={String(selectedYear)}
                onValueChange={(year) => setSelectedYear(parseInt(year))}
            >
                <SelectTrigger className="w-32">
                    <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                    {yearsWithData.map(year => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-80">
             <ExpenseChart expenses={filteredYearlyExpenses} categories={expenseCategories} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-center space-y-2">
            <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                <DialogTrigger asChild>
                    <button className="flex items-center p-3 rounded-lg hover:bg-muted transition-colors w-full text-left">
                        <PlusCircle className="w-5 h-5 mr-3 text-primary"/>
                        <div className="flex-1">
                            <p className="font-semibold">Add Unplanned Expense</p>
                            <p className="text-sm text-muted-foreground">Log a real-time expense.</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground"/>
                    </button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                    <DialogTitle>Add Unplanned Expense</DialogTitle>
                    <DialogDescription>
                        Log a new completed expense transaction.
                    </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddExpense}>
                    <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="description" className="text-left sm:text-right">Description</Label>
                        <Input id="description" placeholder="e.g., Dinner Out" className="col-span-1 sm:col-span-3" value={newExpenseDesc} onChange={e=>setNewExpenseDesc(e.target.value)} required/>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-left sm:text-right">Amount ({getSymbol()})</Label>
                        <Input id="amount" type="number" placeholder="e.g., 1200" className="col-span-1 sm:col-span-3" value={newExpenseAmount} onChange={e=>setNewExpenseAmount(e.target.value)} required/>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-4">
                        <Label className="text-left sm:text-right pt-2">Category</Label>
                        <ScrollArea className="h-32 w-full col-span-1 sm:col-span-3 rounded-md border">
                            <RadioGroup value={newExpenseCategory} onValueChange={(v) => setNewExpenseCategory(v)} className="p-4">
                                {expenseCategories.map(category => (
                                    <div key={category.id} className="flex items-center space-x-2">
                                        <RadioGroupItem value={category.name} id={`expense-${category.id}`} />
                                        <Label htmlFor={`expense-${category.id}`}>{category.name}</Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </ScrollArea>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                        <Label htmlFor="date" className="text-left sm:text-right">Date</Label>
                        <Input id="date" type="date" className="col-span-1 sm:col-span-3" value={newExpenseDate} onChange={e=>setNewExpenseDate(e.target.value)} required/>
                    </div>
                    <Button type="submit" className="w-full">Add Expense</Button>
                    </div>
                    </form>
                </DialogContent>
            </Dialog>

             <Link href="/products" className="flex items-center p-3 rounded-lg hover:bg-muted transition-colors">
                <Utensils className="w-5 h-5 mr-3 text-primary"/>
                <div className="flex-1">
                    <p className="font-semibold">Update Products</p>
                    <p className="text-sm text-muted-foreground">Manage your inventory.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground"/>
             </Link>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Upcoming Transactions</CardTitle>
            <CardDescription>Due within {settings?.notificationSettings?.transactions?.reminderDays || 3} day(s).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {upcomingTransactions.length > 0 ? upcomingTransactions.slice(0, 3).map((item) => (
                <li key={item.id} className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-sm text-muted-foreground">Due: {new Date(item.date).toLocaleDateString()}</p>
                  </div>
                  <p className={cn(
                      "font-semibold text-lg",
                      item.type === 'income' ? 'text-green-500' : 'text-red-500'
                  )}>
                    {item.type === 'income' ? '+' : '-'}{getSymbol()}{item.amount.toLocaleString()}
                  </p>
                </li>
              )) : (
                <p className="text-sm text-muted-foreground text-center">No upcoming transactions found.</p>
              )}
            </ul>
             {upcomingTransactions.length > 3 && (
                <div className="mt-4 text-center">
                    <Button variant="link" asChild>
                        <Link href="/budget">View all</Link>
                    </Button>
                </div>
            )}
          </CardContent>
        </Card>

        {lowStockProducts.length > 0 && (
            <Card className="lg:col-span-4">
                <CardHeader>
                    <CardTitle className="flex items-center text-amber-500">
                        <AlertCircle className="mr-2 h-5 w-5" />
                        Low Stock Alerts
                    </CardTitle>
                    <CardDescription>These products are running low and need to be restocked.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {lowStockProducts.map(product => (
                        <Link href="/products" key={product.id}>
                            <Card className="hover:shadow-lg transition-shadow h-full">
                                <CardHeader className="p-3">
                                    <CardTitle className="text-base">{product.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-3 pt-0">
                                    <p className="text-xl font-bold">{product.currentStock.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">{product.unit}</span></p>
                                    <p className="text-xs text-muted-foreground">
                                        Alert at: {product.lowStockThreshold} {product.unit}
                                    </p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                    </div>
                </CardContent>
            </Card>
        )}
        
        <Card className="lg:col-span-4">
            <CardHeader>
                <CardTitle className="flex items-center">
                    <Gift className="mr-2 h-5 w-5 text-primary" />
                    Upcoming Events
                </CardTitle>
                <CardDescription>Upcoming birthdays and special events for your family.</CardDescription>
            </CardHeader>
            <CardContent>
                {upcomingEvents.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {upcomingEvents.slice(0,10).map((event, index) => (
                             <Card key={index} className="flex flex-col items-center justify-center p-4 text-center">
                                <Image
                                    src={event.member.avatarUrl}
                                    alt={event.member.name}
                                    width={64}
                                    height={64}
                                    className="rounded-full mb-2"
                                />
                                <p className="font-semibold">{event.member.name}</p>
                                <p className="text-sm text-primary">{event.eventName}</p>
                                <p className="text-xs text-muted-foreground">{format(event.eventDate, 'MMMM do')}</p>
                                <p className="text-2xl font-bold mt-1">
                                    {event.daysLeft === 0 ? 'Today!' : event.daysLeft}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {event.daysLeft > 0 && `day${event.daysLeft > 1 ? 's' : ''} left`}
                                </p>
                             </Card>
                        ))}
                    </div>
                ): (
                    <p className="text-sm text-muted-foreground text-center py-8">No upcoming family events.</p>
                )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
