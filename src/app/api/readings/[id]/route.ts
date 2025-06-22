// src/app/api/readings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route"; // Adjust path

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const readingId = params.id;

  if (!session || !(session.user as any)?.id) { // Check for user.id
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any).id;

  try {
    const body = await req.json();
    const {
      meterType,
      previousReading,
      currentReading,
      ratePerUnit,
      readingDate, // ISO String
      dueDate,     // Optional ISO String or null
    } = body;

    const currentDbReading = await prisma.reading.findUnique({
        where: { id: readingId } // Check existence first
    });

    if (!currentDbReading) {
        return NextResponse.json({ message: 'Reading not found.' }, { status: 404 });
    }
    // Verify ownership
    if (currentDbReading.userId !== userId) {
        return NextResponse.json({ message: 'Forbidden: You do not own this reading.' }, { status: 403 });
    }

    const dataToUpdate: any = {};

    if (meterType !== undefined) dataToUpdate.meterType = meterType;
    if (previousReading !== undefined) dataToUpdate.previousReading = parseFloat(previousReading.toFixed(2));
    if (currentReading !== undefined) dataToUpdate.currentReading = parseFloat(currentReading.toFixed(2));
    if (ratePerUnit !== undefined) dataToUpdate.ratePerUnit = parseFloat(ratePerUnit.toFixed(2));
    if (readingDate !== undefined) dataToUpdate.readingDate = new Date(readingDate);

    if (dueDate !== undefined) { // Allows setting dueDate to null
        dataToUpdate.dueDate = dueDate ? new Date(dueDate) : null;
    }

    // Recalculate unitsConsumed and totalCost if relevant fields are updated
    const newPrevReading = dataToUpdate.previousReading !== undefined ? dataToUpdate.previousReading : currentDbReading.previousReading;
    const newCurrReading = dataToUpdate.currentReading !== undefined ? dataToUpdate.currentReading : currentDbReading.currentReading;
    const newRate = dataToUpdate.ratePerUnit !== undefined ? dataToUpdate.ratePerUnit : currentDbReading.ratePerUnit;

    if (newCurrReading < newPrevReading) {
        return NextResponse.json({ message: 'Current reading cannot be less than previous reading' }, { status: 400 });
    }

    if (
        dataToUpdate.previousReading !== undefined ||
        dataToUpdate.currentReading !== undefined ||
        dataToUpdate.ratePerUnit !== undefined
    ) {
        dataToUpdate.unitsConsumed = parseFloat((newCurrReading - newPrevReading).toFixed(2));
        dataToUpdate.totalCost = parseFloat(((newCurrReading - newPrevReading) * newRate).toFixed(2));
    }

    if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ message: 'No fields to update provided.' }, { status: 400 });
    }

    const updatedReading = await prisma.reading.update({
      where: {
        id: readingId,
        // userId: userId // Ownership already verified above, Prisma ensures this if included
      },
      data: dataToUpdate,
    });

    return NextResponse.json(updatedReading, { status: 200 });
  } catch (error: any) {
    console.error('Error updating reading:', error);
    if (error.code === 'P2025') { // Prisma error for record to update not found
        return NextResponse.json({ message: 'Reading not found' }, { status: 404 });
    }
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const readingId = params.id;

  if (!session || !(session.user as any)?.id) { // Check for user.id
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any).id;

  try {
    const readingToDelete = await prisma.reading.findUnique({
        where: { id: readingId }
    });

    if (!readingToDelete) {
        return NextResponse.json({ message: 'Reading not found.' }, { status: 404 });
    }
    if (readingToDelete.userId !== userId) {
        return NextResponse.json({ message: 'Forbidden: You do not own this reading.' }, { status: 403 });
    }

    await prisma.reading.delete({
      where: {
        id: readingId,
        // userId: userId // Ownership verified
      },
    });
    // It's common to return 204 No Content for successful DELETE operations
    // However, returning a message can also be fine.
    return NextResponse.json({ message: 'Reading deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting reading:', error);
    if (error.code === 'P2025') { // Prisma error for record to delete not found
        return NextResponse.json({ message: 'Reading not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
