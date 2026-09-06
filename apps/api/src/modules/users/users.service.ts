import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { Role, User } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateUserInput, ListUsersQueryInput } from './schemas/user.schema.js';

type UserWithRole = User & { role: Role };

const PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQueryInput) {
    const where = query.role ? { role: { code: query.role } } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: true },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items.map(toUserDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserDto(user);
  }

  async create(input: CreateUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { code: input.role } });
    if (!role) {
      throw new UnprocessableEntityException(`Role ${input.role} is not configured`);
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        roleId: role.id,
        department: input.department,
        batch: input.batch,
      },
      include: { role: true },
    });

    return toUserDto(user);
  }
}

/** Never includes passwordHash — this is the only shape a user row is ever serialized as. */
function toUserDto(user: UserWithRole) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code,
    department: user.department,
    batch: user.batch,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}
