import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    JoinTable,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import Application from './Application';
import Invite from './Invite';

@Entity({name: 'guild'})
export default class Guild extends BaseEntity {
    @PrimaryGeneratedColumn({name: 'id'})
    public id: number;

    @Column({type: 'bigint', nullable: true, unique: true})
    public guildId?: string | null;

    @Column({type: 'varchar', name: 'name', length: 255, unique: true})
    public name: string;

    @Column({type: 'varchar', name: 'inviteCode', length: 255, nullable: true})
    public inviteCode: string;

    @CreateDateColumn({type: 'timestamp', name: 'createdAt'})
    public createdAt: Date;

    @OneToOne((_type) => Application, (application) => application.guild)
    public application?: Application | null;

    @OneToMany((_type) => Invite, (invite) => invite.guild)
    @JoinTable()
    public invites: Invite[];

    @Column({type: 'simple-json'})
    public members: string[];

    @Column({type: 'simple-json'})
    public owners: string[];

    @Column({type: 'bigint', nullable: true, unique: true})
    public roleId?: string | null;
}
