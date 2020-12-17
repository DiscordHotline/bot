import { getRepository } from 'typeorm';
import { Vouch } from '../Entity';
import { InteractionCreate } from '../index';
import AbstractCommand from './AbstractCommand';

const { pluginConfigs: { CommandPlugin } } = require('../../../../package.json');

export default class VouchCommand extends AbstractCommand<'vouch', { name: 'user' | 'reason', value: string }> {
  public static Name = 'vouch';
  public get schema() {
    return {
      guild:       CommandPlugin.hotlineGuildId,
      name:        VouchCommand.Name,
      description: 'Vouch for a user\'s acceptance into hotline',
      options:     [
        {
          name:        'user',
          description: 'User you are vouching for',
          type:        6,
          required:    true,
        },
        {
          name:        'reason',
          description: 'Reason for vouching for this person',
          type:        3,
          required:    true,
        },
      ],
    };
  }

  public async process(interaction: InteractionCreate<{ name: 'vouch'; id: string; options: { name: 'user' | 'reason', value: string }[] }>) {
    if (!interaction.member.roles.includes(CommandPlugin.memberRoleId)) {
      await this.acknowledge(interaction, 2);
      return;
    }

    const guild = this.client.guilds.get(interaction.guild_id);
    await guild.fetchAllMembers();

    const userId = interaction.data.options.find((x) => x.name === 'user').value;
    const reason = interaction.data.options.find((x) => x.name === 'reason').value;
    const user   = guild.members.get(userId);
    if (user.roles.includes(CommandPlugin.memberRoleId)) {
      await this.acknowledge(interaction, 4, { content: `<@${user.id}> is already a member!.` });
    }

    const repo = getRepository(Vouch);
    const vouch = repo.create();
    vouch.voucher = interaction.member.user.id;
    vouch.vouchee = userId;
    vouch.description = reason;
    vouch.insertDate = new Date();
    await vouch.save();

    await guild.addMemberRole(
      user.id,
      CommandPlugin.memberRoleId,
      `Vouched for by ${interaction.member.user.id}: ${reason}`,
    );

    await this.acknowledge(
      interaction,
      4,
      { content: `Thank you <@${interaction.member.user.id}> for vouching for <@${user.id}>.` },
    );
  }
}