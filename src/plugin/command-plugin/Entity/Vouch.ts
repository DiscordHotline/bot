import {BaseEntity, Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity({name: 'vouch'})
export default class Vouch extends BaseEntity {
    @PrimaryGeneratedColumn({name: 'id'})
    public id: number;

    @Column({type: 'bigint', name: 'voucher'})
    public voucher: string;

    @Column({type: 'bigint', name: 'vouchee'})
    public vouchee: string;

    @Column({type: 'text', name: 'description'})
    public description: string;

    @Column({type: 'boolean', name: 'approved'})
    public approved: boolean = false;

    @Column({type: 'datetime', name: 'insert_date'})
    public insertDate: Date;

    @Column({type: 'datetime', name: 'approved_date', nullable: true})
    public approvedDate: Date;
}
