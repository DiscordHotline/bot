import {BaseEntity, Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity('subscription')
export default class Subscription extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({type: 'bigint'})
    public guildId: string;

    @Column({type: 'bigint'})
    public channelId: string;

    @Column({type: 'simple-array'})
    public tags: number[];

    @Column({type: 'tinyint'})
    public onUsersInServer: boolean = true;

    @Column({type: 'datetime'})
    public insertDate: Date = new Date();

    @Column({type: 'datetime'})
    public updateDate: Date = new Date();
}
