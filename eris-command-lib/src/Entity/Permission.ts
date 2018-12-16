import {BaseEntity, Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

export enum PermissionType {
    User = 1,
    Role = 2,
}

@Entity('Permission')
export class Permission extends BaseEntity {
    public static PermissionType = PermissionType;

    @PrimaryGeneratedColumn()
    public Id: number;

    @Column({type: 'bigint'}) @Index('guild', ['GuildID'])
    public GuildId: string;

    @Column({length: 512}) @Index('node', ['Node'])
    public Node: string;

    @Column() @Index('type', ['Type'])
    public Type: PermissionType;

    @Column({type: 'bigint'}) @Index('type_id', ['TypeId'])
    public TypeId: string;

    @Column() @Index('allowed', ['Allowed'])
    public Allowed: boolean = true;

    public constructor(init?: Partial<Permission>) {
        super();
        Object.assign(this, init);
    }
}

export default Permission;
