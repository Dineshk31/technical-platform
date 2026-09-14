import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { AuthenticatedUser } from '@technical-platform/shared';
import type { Prisma, Role, User } from '../../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateUserInput, ListUsersQueryInput, UpdateUserInput } from './schemas/user.schema.js';

type UserWithRole = User & { role: Role };

const PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQueryInput) {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = { code: query.role };
    if (query.department) where.department = { equals: query.department, mode: 'insensitive' };
    if (query.batch) where.batch = { equals: query.batch, mode: 'insensitive' };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
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

  /**
   * PATCH /users/:id (§F/§G of the transformation plan — the one backend gap
   * blocking a real Users page). `role` and `isActive` are security-relevant, so
   * this refuses any change that would lock the acting admin out of their own
   * account (self-demotion to STUDENT, self-deactivation) rather than trusting
   * the frontend to prevent it — see §I risk note on the Users PATCH endpoint.
   */
  async update(id: string, input: UpdateUserInput, actingUser: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const isSelf = actingUser.id === id;
    if (isSelf && input.role !== undefined && input.role !== existing.role.code) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if (isSelf && input.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const data: Prisma.UserUpdateInput = {};
    if (input.department !== undefined) data.department = input.department;
    if (input.batch !== undefined) data.batch = input.batch;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.role !== undefined && input.role !== existing.role.code) {
      const role = await this.prisma.role.findUnique({ where: { code: input.role } });
      if (!role) {
        throw new UnprocessableEntityException(`Role ${input.role} is not configured`);
      }
      data.role = { connect: { id: role.id } };
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No changes to apply');
    }

    const user = await this.prisma.user.update({ where: { id }, data, include: { role: true } });
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
