import {BaseEntity, Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn} from 'typeorm';
import Guild from './Guild';

export interface Vote {
    User: string;
    Vote: VoteType;
}

export enum ApprovalType {
    AWAITING,
    APPROVED,
    DENIED,
}

export const ApprovalColor = [
    3447003,
    65280,
    16711680,
];

export enum VoteType {
    APPROVED = 1,
    DENIED,
}

export interface VoteResults {
    approvals: number;
    denies: number;
    entries: {[userId: string]: VoteType};
}

@Entity({name: 'application'})
export default class Application extends BaseEntity {
    @PrimaryGeneratedColumn({name: 'id'})
    public id: number;

    @Column({type: 'bigint', name: 'request_user'})
    public requestUser: string;

    @OneToOne((_type) => Guild, (guild) => guild.application, {eager: true})
    @JoinColumn()
    public guild: Guild;

    @Column({type: 'text', name: 'reason'})
    public reason: string;

    @Column({type: 'text', name: 'invite_code'})
    public inviteCode: string;

    @Column({type: 'tinyint', name: 'posted', default: false})
    public posted: boolean = false;

    @Column({type: 'tinyint', name: 'vote_approved', default: ApprovalType.AWAITING})
    public voteApproved: ApprovalType = ApprovalType.AWAITING;

    @Column({type: 'tinyint', name: 'vote_passed', default: ApprovalType.AWAITING})
    public votePassed: ApprovalType = ApprovalType.AWAITING;

    @Column({type: 'json', name: 'votes', nullable: true})
    public votes?: VoteResults;

    @Column({type: 'datetime', name: 'insert_date'})
    public insertDate: Date;

    @Column({type: 'datetime', name: 'approved_date', nullable: true})
    public approvedDate: Date;

    @Column({type: 'datetime', name: 'passed_date', nullable: true})
    public passedDate: Date;

    @Column({type: 'varchar', length: 64, name: 'approval_message_id', nullable: true})
    public approvalMessageId: string;

    @Column({type: 'varchar', length: 64, name: 'vote_message_id', nullable: true})
    public voteMessageId: string;

    @Column({type: 'bigint', name: 'discussion_channel', nullable: true})
    public discussionChannel: string;
}
