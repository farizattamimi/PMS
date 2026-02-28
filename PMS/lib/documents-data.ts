import { prisma } from '@/lib/prisma'

export const documentQueries = {
  findMany: async (args: any): Promise<any[]> => prisma.document.findMany(args),
}
