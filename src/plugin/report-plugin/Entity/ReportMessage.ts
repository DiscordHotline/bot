import {BaseEntity, Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity('report_message')
export default class ReportMessage extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column()
    public reportId: number;

    @Column({type: 'bigint'})
    public guildId: string;

    @Column({type: 'bigint'})
    public channelId: string;

    @Column({type: 'bigint'})
    public messageId: string;

    @Column({type: 'tinyint', default: false})
    public deleted: boolean = false;

    @Column({type: 'datetime'})
    public insertDate: Date = new Date();

    @Column({type: 'datetime'})
    public updateDate: Date = new Date();
}
