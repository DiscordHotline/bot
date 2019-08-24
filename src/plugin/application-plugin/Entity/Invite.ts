import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import Guild from './Guild';

export interface UseMetadata {
    user: string;
    usedAt: Date;
}

@Entity({name: 'invite'})
export default class Invite extends BaseEntity {
    @PrimaryGeneratedColumn({name: 'id'})
    public id: number;

    @CreateDateColumn({type: 'timestamp', name: 'createdAt'})
    public createdAt: Date;

    @ManyToOne((_type) => Guild, (guild) => guild.invites, {eager: true})
    @JoinColumn()
    public guild: Guild;

    @Column({type: 'datetime', name: 'expiresAt', nullable: true})
    public expiresAt?: Date;

    @Column({type: 'varchar', name: 'code', length: 100})
    @Index({unique: true})
    public code: string;

    @Column({type: 'tinyint', name: 'maxUses', default: 5})
    public maxUses: number;

    @Column({type: 'tinyint', name: 'uses', default: 0})
    public uses: number;

    @Column({type: 'json', name: 'useMetadata'})
    public useMetadata: UseMetadata[];

    @Column({
        type: 'tinyint', name: 'revoked', default: 0, width: 1, transformer: {
            from: (value) => !!value,
            to:   (value) => value ? 1 : 0,
        },
    })
    public revoked: boolean;
}
