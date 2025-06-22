// src/app/api/readings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route"; // Adjust path as needed

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !(session.user as any)?.id) { // Check for user.id specifically
    return NextResponse.json({ message: 'Unauthorized: You must be logged in to perform this action.' }, { status: 401 });
  }
  const userId = (session.user as any).id;


  try {
    const body = await req.json();
    const {
      meterType,
      previousReading,
      currentReading,
      ratePerUnit,
      readingDate, // Expect ISO string date e.g., "2024-07-15T00:00:00.000Z"
      dueDate,     // Optional ISO string date
    } = body;

    if (
      !meterType ||
      typeof previousReading !== 'number' ||
      typeof currentReading !== 'number' ||
      typeof ratePerUnit !== 'number' ||
      !readingDate
    ) {
      return NextResponse.json({ message: 'Missing or invalid required fields' }, { status: 400 });
    }

    if (currentReading < previousReading) {
        return NextResponse.json({ message: 'Current reading cannot be less than previous reading' }, { status: 400 });
    }

    const unitsConsumed = parseFloat((currentReading - previousReading).toFixed(2));
    const totalCost = parseFloat((unitsConsumed * ratePerUnit).toFixed(2));

    const newReading = await prisma.reading.create({
      data: {
        userId, // Now from actual session
        meterType,
        previousReading: parseFloat(previousReading.toFixed(2)),
        currentReading: parseFloat(currentReading.toFixed(2)),
        unitsConsumed,
        ratePerUnit: parseFloat(ratePerUnit.toFixed(2)),
        totalCost,
        readingDate: new Date(readingDate),
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    return NextResponse.json(newReading, { status: 201 });

  } catch (error) {
    console.error('Error creating reading:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    // Add more specific error handling for Prisma if needed
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !(session.user as any)?.id) { // Check for user.id
    return NextResponse.json({ message: 'Unauthorized: You must be logged in to view readings.' }, { status: 401 });
  }
  const userId = (session.user as any).id;

  try {
    const readings = await prisma.reading.findMany({
      where: { userId },
      orderBy: {
        readingDate: 'desc',
      },
    });
    return NextResponse.json(readings, { status: 200 });
  } catch (error) {
    console.error('Error fetching readings:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
