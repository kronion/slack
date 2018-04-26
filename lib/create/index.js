const {
  GitHubUser,
  Subscription,
} = require('../models');

const createIssueDialog = require('../messages/create/create-issue-dialog')

async function openDialog(req, res) {
  const {
    command,
    gitHubUser,
    slackWorkspace,
  } = res.locals;

  const subscriptions = await Subscription.findAll({
    where: { channelId: req.body.channel_id, slackWorkspaceId: slackWorkspace.id },
  });
  if (subscriptions.length === 0) {
    return command.respond({ text: 'This channel is not subscribed to any repositories' });
  }

  let repositories = await Promise.all(subscriptions.map(async (subscription) => {
    const github = gitHubUser.client;
    try {
      const repository = await github.repos.getById({ id: subscription.githubId });
      return repository.data;
    } catch (err) {
      req.log.error({ err, repoId: subscription.githubId }, 'Could not find repository for subscription');
      if (err.code !== 404) {
        throw err;
      }
    }
  }));
  // remove undefined
  repositories = repositories.filter(repo => repo);

  const { trigger_id } = req.body;
  await slackWorkspace.client.dialog.open({ dialog: createIssueDialog(repositories), trigger_id });

  return command.respond();
}

async function dialogSubmit(req, res) {
  const { slackUser, slackWorkspace } = res.locals;

  const { title, body } = req.body.submission;
  let { repository } = req.body.submission;

  if (!repository) {
    const subscription = await Subscription.findOne({
      where: { channelId: req.body.channel.id, slackWorkspaceId: slackWorkspace.id },
    });
    repository = subscription.githubId;
  }
  await slackUser.reload({ include: [GitHubUser] });
  const { data } = await slackUser.GitHubUser.client.repos.getById({ id: repository });
  const owner = data.owner.login;
  const repo = data.name;
  await slackUser.GitHubUser.client.issues.create({
    owner,
    repo,
    title,
    body,
  });

  return res.send();
}


module.exports = {
  openDialog,
  dialogSubmit,
};